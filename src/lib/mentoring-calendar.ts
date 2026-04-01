import { formatDateKST } from '@/lib/utils';

/** KST 달력 기준: ymd가 속한 주의 월요일 YYYY-MM-DD */
export function getMondayOfWeekKST(ymd: string): string {
  const d = new Date(`${ymd.split('T')[0]}T12:00:00+09:00`);
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + mondayOffset * 86400000);
  return formatDateKST(monday);
}

/** KST 기준 월의 일 수 */
export function kstDaysInMonth(year: number, month1: number): number {
  const nm = month1 === 12 ? 1 : month1 + 1;
  const ny = month1 === 12 ? year + 1 : year;
  const end = new Date(`${ny}-${String(nm).padStart(2, '0')}-01T12:00:00+09:00`);
  const start = new Date(`${year}-${String(month1).padStart(2, '0')}-01T12:00:00+09:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

/** KST 해당 날짜 요일 0=일 … 6=토 */
export function kstWeekday(year: number, month1: number, day: number): number {
  return new Date(
    `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00+09:00`
  ).getUTCDay();
}

export function monthRangeYmd(year: number, month1: number): { fromYmd: string; toYmd: string } {
  const fromYmd = `${year}-${String(month1).padStart(2, '0')}-01`;
  const dim = kstDaysInMonth(year, month1);
  const toYmd = `${year}-${String(month1).padStart(2, '0')}-${String(dim).padStart(2, '0')}`;
  return { fromYmd, toYmd };
}
