// 영단어 단어의 품사 그룹(problem_group) 파싱·표시 유틸 (SSOT).
// problem_group 은 "1, 2" 처럼 쉼표로 여러 그룹이 들어오는 멀티값 텍스트다
// (명사=1, 형용사=2, 부사=3, 동사=4, 숙어=5). 한 단어가 여러 품사에 동시 소속될 수 있다.
//
// ⚠️ 'use server' 가 아닌 순수 유틸 모듈이어야 한다.
// vocab.ts('use server')에서 export 하면 client 컴포넌트가 import 할 수 없으므로,
// 출제 로직(server)과 화면 표시(client)가 함께 쓰는 이 모듈에 둔다.

export const PROBLEM_GROUP_LABELS: Record<number, string> = {
  1: '명사',
  2: '형용사',
  3: '부사',
  4: '동사',
  5: '숙어',
};

/**
 * "1, 2" → [1, 2]. 쉼표 분리 후 유한 숫자만 통과시키고 중복을 제거한다.
 * 비숫자/빈 토큰("1, abc", "1,,2")은 버린다 — NaN 이 그룹 키로 새면
 * 서로 다른 비숫자 토큰이 한 버킷으로 합쳐져 잘못된 교집합이 생긴다.
 */
export function parseProblemGroups(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const token of raw.split(',')) {
    const t = token.trim();
    if (!t) continue;
    const n = Number(t);
    if (!Number.isFinite(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * "1, 2" → "명사·형용사". 표시용. 라벨이 없는 번호는 숫자를 그대로 표기한다.
 * 유효 그룹이 없으면 빈 문자열.
 */
export function formatProblemGroups(raw: string | null | undefined): string {
  const groups = parseProblemGroups(raw);
  if (groups.length === 0) return '';
  return groups.map((n) => PROBLEM_GROUP_LABELS[n] ?? String(n)).join('·');
}
