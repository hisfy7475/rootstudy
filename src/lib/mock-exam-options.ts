/**
 * 모의고사 옵션 표시 헬퍼. 서버 액션 아님.
 * 'use server' 파일은 모든 export 가 async 여야 하므로 sync helper 는 여기에 둔다.
 */

import type {
  MockExamOptionGroupWithOptions,
  MockExamOptionSelectionInput,
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

/**
 * 선택한 옵션 입력을 결제 페이지로 운반하기 위한 URL 쿼리 값으로 직렬화.
 * (group_id/option_id 는 uuid 라 ASCII — JSON + encodeURIComponent 로 충분.)
 * 빈 배열이면 빈 문자열을 반환해 쿼리에서 생략할 수 있게 한다.
 */
export function encodeOptionSelectionsParam(selections: MockExamOptionSelectionInput[]): string {
  if (!selections || selections.length === 0) return '';
  return encodeURIComponent(JSON.stringify(selections));
}

/**
 * 결제 페이지에서 받은 옵션 쿼리 값을 입력 배열로 안전 파싱.
 * Next.js searchParams 는 이미 URL-decode 된 값을 주므로 JSON.parse 만 수행한다.
 */
export function decodeOptionSelectionsParam(
  raw: string | string[] | undefined,
): MockExamOptionSelectionInput[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: MockExamOptionSelectionInput[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { group_id?: unknown }).group_id === 'string' &&
        typeof (item as { option_id?: unknown }).option_id === 'string'
      ) {
        out.push({
          group_id: (item as { group_id: string }).group_id,
          option_id: (item as { option_id: string }).option_id,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 옵션 입력(id 쌍)을 옵션 그룹 정보로 매핑해 표시용 스냅샷(이름 포함)으로 변환.
 * 활성 그룹에 없는 옵션은 제외(표시 누락이어도 실제 검증/저장은 서버 startMealPayment 가 책임).
 */
export function mapOptionInputsToSnapshots(
  groups: MockExamOptionGroupWithOptions[],
  inputs: MockExamOptionSelectionInput[],
): MockExamOptionSelectionSnapshot[] {
  const byKey = new Map<string, MockExamOptionSelectionSnapshot>();
  for (const g of groups) {
    for (const o of g.options) {
      byKey.set(`${g.id}:${o.id}`, {
        group_id: g.id,
        group_name: g.name,
        option_id: o.id,
        option_name: o.name,
      });
    }
  }
  const out: MockExamOptionSelectionSnapshot[] = [];
  for (const s of inputs) {
    const snap = byKey.get(`${s.group_id}:${s.option_id}`);
    if (snap) out.push(snap);
  }
  return out;
}
