// Supabase `.range(from, to)` 인자 변환 + 페이지 클램프 헬퍼.

const MAX_PAGE_SIZE = 200;

export function toRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize)));
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

/**
 * 요청 page 가 마지막 페이지를 넘을 때 마지막 페이지 번호로 클램프.
 * total === 0 일 때는 1 을 반환 (빈 결과의 첫 페이지로 표시).
 */
export function clampPage(page: number, total: number, pageSize: number): number {
  if (total === 0) return 1;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, page), lastPage);
}
