export const SUPABASE_PAGE_SIZE = 1000;

// Supabase/PostgREST 기본 행 한도(1000)를 넘는 조회를 .range() 루프로 모두 수집.
// 호출부는 반드시 .order(stable_col) 을 포함해야 페이지 간 중복/누락이 발생하지 않는다.
export async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return all;
}
