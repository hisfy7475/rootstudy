import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parse, addMinutes, subMinutes } from 'date-fns';
import { DAY_CONFIG, ABSENCE_BUFFER_MINUTES } from './constants';
import type { StudentAbsenceSchedule } from '@/types/database';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * RFC 4122 v4 UUID 생성. crypto.randomUUID 가 있으면 그것을 쓰고,
 * 없으면 crypto.getRandomValues 로 직접 만든다.
 *
 * crypto.randomUUID 는 secure context(HTTPS/localhost)에서만 정의되므로
 * iOS WebView 가 dev 서버를 LAN IP(HTTP)로 접근할 때 undefined 가 된다.
 * crypto.getRandomValues 는 secure context 제약이 없어 모든 환경에서 동작한다.
 */
export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/**
 * 시간을 HH:MM:SS 형식으로 포맷
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs].map((v) => v.toString().padStart(2, '0')).join(':');
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 포맷 (KST 기준)
 */
export function formatDate(date: Date): string {
  return formatDateKST(date);
}

/**
 * 날짜를 KST 기준 YYYY-MM-DD 문자열로 반환
 *
 * @param date - 변환할 날짜 (기본값: 현재 시각)
 * @returns KST 기준 YYYY-MM-DD 문자열
 */
export function formatDateKST(date: Date = new Date()): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstTime = new Date(date.getTime() + KST_OFFSET_MS);
  return kstTime.toISOString().split('T')[0];
}

/**
 * 현재 KST 기준 오늘 날짜를 YYYY-MM-DD로 반환
 */
export function getTodayKST(): string {
  return formatDateKST(new Date());
}

/**
 * YYYY-MM-DD → YY.MM.DD 단축 표기.
 * DB date 컬럼이 ISO 문자열로 내려오는 것을 가정하고 슬라이싱으로 변환.
 */
export function formatYmdShort(ymd: string): string {
  return `${ymd.slice(2, 4)}.${ymd.slice(5, 7)}.${ymd.slice(8, 10)}`;
}

/**
 * 일회성 부재 일정이 KST 달력 기준으로 이미 지났는지 (학생·학부모 리스트에서 제외할 때 사용)
 */
export function isPastOneTimeAbsenceSchedule(
  isRecurring: boolean,
  specificDate: string | null,
): boolean {
  if (isRecurring) return false;
  if (!specificDate) return false;
  return specificDate < getTodayKST();
}

/**
 * KST 달력 주(월~일): 월요일 00:00 KST 이상 ~ 다음 월요일 00:00 KST 미만.
 * 주간 상점 크론과 관리자 주간 순공 집계가 동일한 창을 쓰도록 한다.
 */
export function getCalendarWeekBoundsKST(mondayDateStr: string): {
  start: Date;
  endExclusive: Date;
} {
  const monday = mondayDateStr.split('T')[0];
  const start = new Date(`${monday}T00:00:00+09:00`);
  const endExclusive = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, endExclusive };
}

/**
 * KST 기준 월~일 YYYY-MM-DD 배열 (mondayDateStr은 해당 주의 월요일).
 */
export function getWeekDateStringsFromMondayKST(mondayDateStr: string): string[] {
  const { start } = getCalendarWeekBoundsKST(mondayDateStr);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(formatDateKST(d));
  }
  return dates;
}

/**
 * 학부모 연결 코드 생성 (6자리 영숫자)
 */
export function generateParentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 실제 날짜/시간을 학습일로 변환 (한국 시간 기준)
 *
 * 서버 타임존에 관계없이 한국 시간(KST, UTC+9) 기준으로 계산합니다.
 * - 한국 시간 00:00~03:00 사이는 전날의 학습일
 * - 한국 시간 03:00~06:00 사이는 전날의 학습일 (일일 리셋 구간)
 * - 한국 시간 06:00 이후는 해당 날짜의 학습일
 *
 * @param date - 변환할 날짜/시간 (기본값: 현재 시각, UTC 기준)
 * @returns 학습일 (YYYY-MM-DD 형식의 Date 객체, UTC 자정 기준)
 */
export function getStudyDate(date: Date = new Date()): Date {
  // 한국 시간으로 변환 (UTC + 9시간)
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstTime = new Date(date.getTime() + KST_OFFSET_MS);

  const kstHours = kstTime.getUTCHours();
  const kstMinutes = kstTime.getUTCMinutes();

  // 한국 시간 기준으로 학습일 계산
  // 00:00~06:00 KST는 전날의 학습일 (03:00까지가 학습시간이고, 03:00~06:00은 새벽 리셋 구간)
  const isBeforeStartTime =
    kstHours < DAY_CONFIG.startHour ||
    (kstHours === DAY_CONFIG.startHour && kstMinutes < DAY_CONFIG.startMinute);

  // 한국 시간 기준 날짜 (UTC 자정으로 반환)
  const studyDate = new Date(
    Date.UTC(kstTime.getUTCFullYear(), kstTime.getUTCMonth(), kstTime.getUTCDate(), 0, 0, 0, 0),
  );

  if (isBeforeStartTime) {
    studyDate.setUTCDate(studyDate.getUTCDate() - 1);
  }

  return studyDate;
}

/**
 * 현재 시각이 학습 시간 내인지 확인
 * 학습 시간: 06:00 ~ 다음날 03:00
 *
 * @param date - 확인할 날짜/시간 (기본값: 현재 시각)
 * @returns 학습 시간 내 여부
 */
export function isWithinStudyDay(date: Date = new Date()): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const startMinutes = DAY_CONFIG.startHour * 60 + DAY_CONFIG.startMinute; // 06:00 = 360
  const endMinutes = (DAY_CONFIG.endHour - 24) * 60 + DAY_CONFIG.endMinute; // 03:00 = 180

  // 06:00 ~ 23:59 또는 00:00 ~ 03:00
  return totalMinutes >= startMinutes || totalMinutes < endMinutes;
}

/**
 * 특정 학습일의 시작/종료 시각을 반환 (한국 시간 기준)
 *
 * 서버 타임존에 관계없이 한국 시간(KST, UTC+9) 기준으로 계산합니다.
 * - 시작: 해당 날짜 06:00 KST = 전날 21:00 UTC
 * - 종료: 다음 날짜 03:00 KST = 해당 날짜 18:00 UTC
 *
 * @param studyDate - 학습일 (Date 객체 또는 YYYY-MM-DD 문자열)
 * @returns { start: Date, end: Date } 학습일의 시작/종료 시각 (UTC)
 */
export function getStudyDayBounds(studyDate: Date | string): { start: Date; end: Date } {
  // YYYY-MM-DD 문자열로 정규화
  const dateStr =
    typeof studyDate === 'string' ? studyDate.split('T')[0] : studyDate.toISOString().split('T')[0];

  // 한국 시간 기준 시작/종료 시각을 UTC로 계산
  // KST = UTC + 9시간, 따라서 KST 06:00 = UTC 21:00 (전날)
  const KST_OFFSET_HOURS = 9;

  // 시작: 해당 날짜 06:00 KST = 전날 21:00 UTC
  const startHourUTC = DAY_CONFIG.startHour - KST_OFFSET_HOURS; // 6 - 9 = -3 = 전날 21시
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1); // 전날로 이동
  start.setUTCHours(24 + startHourUTC, DAY_CONFIG.startMinute, 0, 0); // 21:00 UTC

  // 종료: 다음 날짜 03:00 KST = 해당 날짜 18:00 UTC
  const endHourUTC = DAY_CONFIG.endHour - 24 - KST_OFFSET_HOURS; // 3 - 9 = -6 → 해당 날짜 18시 (다음날 03:00 KST)
  const end = new Date(`${dateStr}T00:00:00.000Z`);
  end.setUTCHours(24 + endHourUTC, DAY_CONFIG.endMinute, 0, 0); // 18:00 UTC

  return { start, end };
}

/**
 * KST 기준 현재 분기 시작 시각 반환
 *
 * 분기 경계: 3/1, 6/1, 9/1, 12/1 00:00 KST
 * 1·2월은 직전 12/1 시작 (회계연도 12월 시작)
 *
 * SQL 측 get_current_quarter_start_kst() / get_quarter_start_for_kst() 와 결과 동일.
 */
export function getQuarterStartForDateKST(date: Date = new Date()): Date {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1; // 1..12

  let qYear: number;
  let qMonth: number;
  if (month >= 3 && month <= 5) {
    qYear = year;
    qMonth = 3;
  } else if (month >= 6 && month <= 8) {
    qYear = year;
    qMonth = 6;
  } else if (month >= 9 && month <= 11) {
    qYear = year;
    qMonth = 9;
  } else if (month === 12) {
    qYear = year;
    qMonth = 12;
  } else {
    qYear = year - 1;
    qMonth = 12;
  }

  const mm = String(qMonth).padStart(2, '0');
  return new Date(`${qYear}-${mm}-01T00:00:00+09:00`);
}

/**
 * KST 기준 현재 시각의 분기 시작
 */
export function getCurrentQuarterStartKST(now: Date = new Date()): Date {
  return getQuarterStartForDateKST(now);
}

/**
 * 다음 분기 시작 시각 (D-Day 계산용)
 *
 * 현 분기 시작 + 95일은 반드시 다음 분기에 속하므로,
 * 그 시점의 분기 시작을 다시 계산해 정확한 KST 자정 정렬을 보장한다.
 * (setUTCMonth(+3) 은 KST 자정과 어긋날 수 있어 사용하지 않는다.)
 */
export function getNextQuarterStartKST(now: Date = new Date()): Date {
  const current = getCurrentQuarterStartKST(now);
  const inNextQuarter = new Date(current.getTime() + 95 * 24 * 60 * 60 * 1000);
  return getQuarterStartForDateKST(inNextQuarter);
}

/**
 * 학습주의 시작 시각(월요일 06:00 KST) 반환
 *
 * 기준 시각이 속한 학습일(getStudyDate)을 구한 뒤, 그 주의 월요일 학습일의
 * 시작 시각(06:00 KST = 전날 21:00 UTC)을 반환한다.
 * - 주 시작은 월요일 (DAY_CONFIG.weekStartsOn = 1).
 * - UTC 메서드만 사용하므로 서버 타임존(UTC)·로컬(KST) 어디서 실행해도 동일하다.
 *
 * @param date - 기준 날짜 (기본값: 현재 날짜)
 * @returns 해당 학습주의 시작 시각 (월요일 06:00 KST에 해당하는 UTC Date)
 */
export function getWeekStart(date: Date = new Date()): Date {
  // 학습일(UTC 자정 기준 Date)
  const studyDate = getStudyDate(date);

  // UTC 기준 요일 (studyDate가 UTC 자정이므로 타임존 무관)
  const dayOfWeek = studyDate.getUTCDay(); // 0=일 ... 6=토
  const diff = (dayOfWeek + 6) % 7; // 월요일까지 거슬러 갈 일수 (일요일=6)

  // 이 주의 월요일 학습일
  const monday = new Date(studyDate);
  monday.setUTCDate(monday.getUTCDate() - diff);

  // 월요일 학습일의 시작(06:00 KST = 전날 21:00 UTC)을 주 시작으로 반환
  return getStudyDayBounds(monday).start;
}

/**
 * 날짜를 한국어 형식으로 포맷 (M월 D일)
 */
export function formatDateKorean(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}월 ${day}일`;
}

/**
 * 시간을 한국어 형식으로 포맷 (오전/오후 H시 M분)
 */
export function formatTimeKorean(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours < 12 ? '오전' : '오후';
  const displayHours = hours % 12 || 12;

  if (minutes === 0) {
    return `${period} ${displayHours}시`;
  }
  return `${period} ${displayHours}시 ${minutes}분`;
}

/**
 * 부재 스케줄의 면제 구간 계산 (버퍼 포함)
 *
 * @param schedule - 부재 스케줄 정보
 * @param baseDate - 기준 날짜
 * @returns { start: Date, end: Date } 면제 구간 시작/종료 시각
 */
export function getAbsenceExemptionRange(
  schedule: StudentAbsenceSchedule,
  baseDate: Date,
): { start: Date; end: Date } {
  const scheduleStart = parse(schedule.start_time, 'HH:mm:ss', baseDate);
  const scheduleEnd = parse(schedule.end_time, 'HH:mm:ss', baseDate);
  const bufferMinutes = schedule.buffer_minutes || ABSENCE_BUFFER_MINUTES;

  return {
    start: subMinutes(scheduleStart, bufferMinutes),
    end: addMinutes(scheduleEnd, bufferMinutes),
  };
}

const NATIVE_APP_UA = 'RootStudyApp';

/**
 * User-Agent에 RootStudyApp이 포함되어 있는지 확인하여 네이티브 앱 여부를 판별.
 * - 서버(middleware, Server Component 등): headers()에서 가져온 UA 문자열을 전달
 * - 클라이언트: 인자 없이 호출하면 navigator.userAgent를 사용
 */
export function isNativeApp(userAgent?: string | null): boolean {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return ua.includes(NATIVE_APP_UA);
}

export type NativeAppVersion = { major: number; minor: number };

/**
 * UA의 `RootStudyApp/<major>.<minor>` 패턴에서 버전을 추출.
 * 네이티브 앱이 아니거나 파싱 실패 시 null.
 * 멘토링 첨부 등 신버전 전용 기능을 구버전 앱에서 가드할 때 사용.
 */
export function getNativeAppVersion(userAgent?: string | null): NativeAppVersion | null {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const m = ua.match(/RootStudyApp\/(\d+)\.(\d+)/);
  if (!m) return null;
  const major = parseInt(m[1] ?? '', 10);
  const minor = parseInt(m[2] ?? '', 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
}

/** 네이티브 앱 버전이 (major, minor) 이상인지 비교. UA에 버전이 없으면 false (보수적). */
export function isNativeAppAtLeast(
  major: number,
  minor: number,
  userAgent?: string | null,
): boolean {
  const v = getNativeAppVersion(userAgent);
  if (!v) return false;
  if (v.major !== major) return v.major > major;
  return v.minor >= minor;
}

/** KST 기준 멘토링 슬롯 시작 시각 (ms) */
export function mentoringSlotStartMs(dateYmd: string, startTime: string): number {
  const t = startTime.length >= 8 ? startTime.slice(0, 8) : `${startTime}:00`.slice(0, 8);
  return new Date(`${dateYmd}T${t}+09:00`).getTime();
}
