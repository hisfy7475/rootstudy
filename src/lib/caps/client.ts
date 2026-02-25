import sql from 'mssql';
import type { CapsEnterRecord, CapsGate, CapsConfig } from './types';

// CAPS DB 연결 설정
function getConfig(): CapsConfig & sql.config {
  return {
    server: process.env.CAPS_DB_SERVER || '',
    port: parseInt(process.env.CAPS_DB_PORT || '20202'),
    database: process.env.CAPS_DB_NAME || 'ACSDB',
    user: process.env.CAPS_DB_USER || '',
    password: process.env.CAPS_DB_PASSWORD || '',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 10000,
    },
  };
}

// CAPS DB 연결 풀
let pool: sql.ConnectionPool | null = null;

// 연결 풀 가져오기
async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }
  
  const config = getConfig();
  pool = await sql.connect(config);
  return pool;
}

// 연결 종료
export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

// 출입문 목록 조회
export async function getGates(): Promise<CapsGate[]> {
  const pool = await getPool();
  const result = await pool.request().query('SELECT id, name, ip FROM tgate');
  return result.recordset;
}

// 특정 시점 이후의 출입 기록 조회
// >= 사용: 같은 초의 레코드 누락 방지 (중복은 route 측에서 처리)
export async function getEnterRecordsAfter(
  afterDatetime: string | null
): Promise<CapsEnterRecord[]> {
  const pool = await getPool();
  
  let query: string;
  const request = pool.request();
  
  if (afterDatetime) {
    query = `
      SELECT e_date, e_time, g_id, e_id, e_idno, e_name 
      FROM tenter 
      WHERE CONCAT(e_date, e_time) >= @afterDatetime 
        AND e_id > 0
      ORDER BY e_date, e_time
    `;
    request.input('afterDatetime', sql.VarChar, afterDatetime);
  } else {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const sdate = formatCapsDatetimeKST(twoMinutesAgo);
    
    query = `
      SELECT e_date, e_time, g_id, e_id, e_idno, e_name 
      FROM tenter 
      WHERE CONCAT(e_date, e_time) >= @sdate 
        AND e_id > 0
      ORDER BY e_date, e_time
    `;
    request.input('sdate', sql.VarChar, sdate);
  }
  
  const result = await request.query(query);
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
