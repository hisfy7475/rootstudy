/**
 * 좌석번호 표시 헬퍼 (P0-3 신청내역 좌석번호).
 *
 * 표시 정책:
 *   - snapshot == 현재  → "12"      (단일 표시)
 *   - snapshot != 현재  → "12 (현재 15)"
 *   - snapshot null     → "-"
 *
 * 정렬·필터는 snapshot 기준.
 */
export function formatSeatSnapshot(
  snapshot: number | null | undefined,
  current: number | null | undefined,
): string {
  if (snapshot == null) return '-';
  if (current != null && current !== snapshot) {
    return `${snapshot} (현재 ${current})`;
  }
  return String(snapshot);
}
