/**
 * 모의고사 옵션 표시 헬퍼. 서버 액션 아님.
 * 'use server' 파일은 모든 export 가 async 여야 하므로 sync helper 는 여기에 둔다.
 */

import type {
  MockExamOptionGroupWithOptions,
  MockExamOptionSelectionSnapshot,
} from '@/lib/actions/meal';

/**
 * 옵션 그룹 배열을 "유형: 현장/개별 · 영역: 과탐/사탐/교차" 형태 요약 문자열로 변환.
 * 관리자 목록/등록 카드 등 상품 자체의 옵션 라인업을 보여줄 때 사용.
 */
export function formatMockExamOptionLineup(groups: MockExamOptionGroupWithOptions[]): string {
  if (groups.length === 0) return '';
  return groups.map((g) => `${g.name}: ${g.options.map((o) => o.name).join('/')}`).join(' · ');
}

/**
 * 학생이 선택한 옵션 스냅샷을 "유형: 현장 · 영역: 과탐" 형태로 요약.
 * 결제 페이지·영수증·알림 메시지에 사용.
 */
export function formatOptionSelectionsSummary(
  selections: MockExamOptionSelectionSnapshot[] | unknown,
): string {
  if (!Array.isArray(selections) || selections.length === 0) return '';
  return (selections as MockExamOptionSelectionSnapshot[])
    .map((s) => `${s.group_name}: ${s.option_name}`)
    .join(' · ');
}

/**
 * meal_orders.option_selections 컬럼 (Json) 을 스냅샷 배열로 안전하게 파싱.
 * 형식이 어긋나면 빈 배열 반환.
 */
export function parseOptionSelections(raw: unknown): MockExamOptionSelectionSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: MockExamOptionSelectionSnapshot[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      'group_id' in item &&
      'option_id' in item &&
      'group_name' in item &&
      'option_name' in item
    ) {
      out.push(item as MockExamOptionSelectionSnapshot);
    }
  }
  return out;
}
