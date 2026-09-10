import sql from 'mssql';
import type { CapsEnterRecord, CapsGate, CapsConfig } from './types';

// 요청 타임아웃. mssql 기본값(15초)은 CAPS 서버가 피크 시간대에 잠시 버거워질 때
// 1분 주기 크론을 통째로 실패시켜 입실 반영이 10~20분씩 밀리는 원인이었다(2026-09-09 압구정 문의).
// 크론 주기(60초)와 route 의 재시도 예산 안에 들어오도록 30초로 둔다.
const CAPS_REQUEST_TIMEOUT_MS = 30_000;
const CAPS_CONNECT_TIMEOUT_MS = 10_000;

const ENTER_SELECT = 'SELECT e_date, e_time, g_id, e_id, e_idno, e_name FROM tenter';

// CAPS DB 연결 설정
function getConfig(): CapsConfig & sql.config {
  return {
    server: process.env.CAPS_DB_SERVER || '',
    port: parseInt(process.env.CAPS_DB_PORT || '20202'),
    database: process.env.CAPS_DB_NAME || 'ACSDB',
    user: process.env.CAPS_DB_USER || '',
    password: process.env.CAPS_DB_PASSWORD || '',
    requestTimeout: CAPS_REQUEST_TIMEOUT_MS,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: CAPS_CONNECT_TIMEOUT_MS,
    },
  };
}

// CAPS DB 연결 풀 (이 모듈 소유)
let pool: sql.ConnectionPool | null = null;

// 연결 풀 가져오기
async function getPool(): Promise<sql.ConnectionPool> {
  if (pool) {
    if (pool.connected) return pool;
    // 타임아웃 등으로 끊긴 풀은 정리하고 새로 만든다.
    await closeConnection();
  }

  // sql.connect() 는 mssql 모듈 전역 풀을 공유해 실행이 겹치면 서로의 연결을 닫을 수 있다.
  // 이 모듈이 소유하는 풀만 만들어 쓴다.
  const next = await new sql.ConnectionPool(getConfig()).connect();
  pool = next;
  return next;
}

// 연결 종료
export async function closeConnection(): Promise<void> {
  const current = pool;
  pool = null;
  if (!current) return;

  try {
    await current.close();
  } catch (error) {
    // 타임아웃으로 죽은 연결은 close 자체가 실패("Failed to cancel request")할 수 있다.
    // 참조는 이미 끊었으므로 다음 실행이 새 풀을 만든다.
    console.warn(
      '[caps] pool close failed (ignored):',
      error instanceof Error ? error.message : error,
    );
  }
}

// 출입문 목록 조회
export async function getGates(): Promise<CapsGate[]> {
  const pool = await getPool();
  const result = await pool.request().query<CapsGate>('SELECT id, name, ip FROM tgate');
  return result.recordset;
}

/**
 * CAPS 시각 문자열(YYYYMMDDHHmmss)을 e_date(8)/e_time(6) 으로 나눈다.
 * 두 컬럼은 char(8)/char(6) 고정폭이라 (e_date, e_time) 사전식 비교가 CONCAT 비교와 완전히 같다.
 */
function splitCapsDatetime(value: string): { date: string; time: string } | null {
  if (!/^\d{14}$/.test(value)) return null;
  return { date: value.slice(0, 8), time: value.slice(8) };
}

/**
 * (e_date, e_time) 을 경계값과 비교하는 WHERE 조각을 만들고 파라미터를 바인딩한다.
 *
 * CONCAT(e_date, e_time) >= @x 는 PK(e_date, e_time, …) 인덱스를 못 타서 tenter 전체(약 100만 행)를
 * 매분 스캔했고, 피크 시간대엔 그 스캔이 CAPS 단말의 기록 저장과 경합해 요청 타임아웃으로 이어졌다.
 * e_date 를 선행 조건으로 두면 인덱스 seek 로 바뀐다(실측 158ms → 19ms, 결과 동일).
 * 경계값 형식이 예상과 다르면(발생한 적 없음) 느리지만 정확한 CONCAT 비교로 폴백한다.
 */
function bindDatetimeBound(
  request: sql.Request,
  bound: 'lower' | 'upper',
  value: string,
  name: string,
): string {
  const parts = splitCapsDatetime(value);
  if (!parts) {
    request.input(name, sql.VarChar, value);
    return bound === 'lower'
      ? `CONCAT(e_date, e_time) >= @${name}`
      : `CONCAT(e_date, e_time) <= @${name}`;
  }

  request.input(`${name}Date`, sql.VarChar, parts.date);
  request.input(`${name}Time`, sql.VarChar, parts.time);
  return bound === 'lower'
    ? `e_date >= @${name}Date AND (e_date > @${name}Date OR e_time >= @${name}Time)`
    : `e_date <= @${name}Date AND (e_date < @${name}Date OR e_time <= @${name}Time)`;
}

// 특정 시점 이후의 출입 기록 조회
// >= 사용: 같은 초의 레코드 누락 방지 (중복은 route 측에서 처리)
export async function getEnterRecordsAfter(
  afterDatetime: string | null,
): Promise<CapsEnterRecord[]> {
  const pool = await getPool();
  const request = pool.request();

  // 기준 시점이 없으면(최초 실행) 2분 전부터.
  const since = afterDatetime ?? formatCapsDatetimeKST(new Date(Date.now() - 2 * 60 * 1000));
  const sinceClause = bindDatetimeBound(request, 'lower', since, 'since');

  const result = await request.query<CapsEnterRecord>(`
    ${ENTER_SELECT}
    WHERE ${sinceClause}
      AND e_id > 0
    ORDER BY e_date, e_time
  `);
  return result.recordset;
}

// 특정 기간(CAPS 형식 YYYYMMDDHHmmss)의 모든 출입 기록 조회.
// 과거 게이트 출처 백필(소프트 제외 정정)에 사용. from/to 는 (e_date, e_time) 포함 비교.
export async function getEnterRecordsBetween(from: string, to: string): Promise<CapsEnterRecord[]> {
  const pool = await getPool();
  const request = pool.request();

  const fromClause = bindDatetimeBound(request, 'lower', from, 'from');
  const toClause = bindDatetimeBound(request, 'upper', to, 'to');

  const result = await request.query<CapsEnterRecord>(`
    ${ENTER_SELECT}
    WHERE ${fromClause}
      AND ${toClause}
      AND e_id > 0
    ORDER BY e_date, e_time
  `);
  return result.recordset;
}

// Date를 CAPS 형식(YYYYMMDDHHmmss)으로 변환 (KST 기준)
function formatCapsDatetimeKST(date: Date): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hours = String(kst.getUTCHours()).padStart(2, '0');
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
  const seconds = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// CAPS 날짜/시간을 ISO 형식으로 변환
export function parseCapsDatetime(eDate: string, eTime: string): string {
  // eDate: YYYYMMDD, eTime: HHmmss
  const year = eDate.substring(0, 4);
  const month = eDate.substring(4, 6);
  const day = eDate.substring(6, 8);
  const hours = eTime.substring(0, 2);
  const minutes = eTime.substring(2, 4);
  const seconds = eTime.substring(4, 6);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+09:00`;
}

// CAPS 날짜/시간을 연결된 문자열로 반환 (비교용)
export function getCapsDatetimeString(eDate: string, eTime: string): string {
  return `${eDate}${eTime}`;
}
