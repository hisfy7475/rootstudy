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

/**
 * 엑셀 export 용 좌석 비고.
 *
 * 좌석 정렬(숫자)은 snapshot 컬럼을 따로 두므로, 표시 문자열을 한 셀에 합치면
 * 그 컬럼 전체가 텍스트로 인식되어 정렬이 깨진다. 따라서 "이동했음" 정보만 별도
 * 비고 컬럼으로 분리한다. 이동이 없으면 빈 문자열을 반환한다.
 */
export function formatSeatMovedNote(
  snapshot: number | null | undefined,
  current: number | null | undefined,
): string {
  if (snapshot == null) return '';
  if (current != null && current !== snapshot) {
    return `현재 ${current}`;
  }
  return '';
}
