import { subDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';

export type CancelReason = 'exam' | 'recurring_deadline' | 'one_time_deadline' | 'product_inactive';

export type CancelDecision = { ok: true } | { ok: false; reason: CancelReason };

/**
 * 비활성 상품 셀프 환불 차단(product_inactive) 정책 시행 시각 (KST).
 *
 * 이 시각 "이전"에 결제된 주문에는 적용하지 않는다. 결제 당시 안내된 약관
 * (이용일 2일 전까지 환불 가능)대로 기존 기한 규칙만 적용한다.
 *
 * 운영상 판매 마감일에 상품을 '비활성'으로 내리고 있어, 소급 적용하면 아직 이용 전인
 * 결제 건까지 환불이 막힌다. 신규 결제부터 적용해 소급 불이익을 없앤다.
 * 시행일 이전 결제 건이 모두 이용 완료되면(=취소 기한이 지나면) 이 예외는 자연히 사라지므로,
 * 그때 상수와 purchasedAt 인자를 함께 제거해도 동작은 동일하다.
 */
export const INACTIVE_REFUND_BLOCK_EFFECTIVE_AT = new Date('2026-07-27T00:00:00+09:00').getTime();

/**
 * 주문 취소 가능 여부 판정.
 *
 * - 모의고사(category='exam'): 결제 후 즉시 취소 불가
 * - 정기 메뉴(kind='recurring'): 식사 시작 월요일의 직전 주 금요일까지 취소 가능
 *   (start_date - 3일 = 직전 금요일. 일자 단위 비교로 자정 경계 자연 처리)
 * - 일일 메뉴(kind='one_time'): 식사일 2일 전까지 취소 가능
 * - 상품이 비활성(status='inactive'): 셀프 환불 불가 (관리자 강제 취소는 별도 경로로 계속 가능).
 *   단 INACTIVE_REFUND_BLOCK_EFFECTIVE_AT 이후 결제분에만 적용한다(소급 없음).
 *
 * 판정 순서에 의미가 있다.
 *  1) exam 을 맨 앞에 둬야 비활성 모의고사에도 "결제 후 취소 불가"(약관 문구)가 유지된다.
 *  2) product_inactive 는 기한 판정 "뒤"에 둔다. 앞에 두면 이미 이용이 끝난 과거 주문
 *     (판매 마감 후 상품을 비활성으로 내리는 운영 관행상 대다수)까지 안내가 "지점 문의"로
 *     바뀌어 버린다. 기한이 살아 있는 건에만 새 사유를 노출한다.
 *
 * sold_out(품절)은 차단 대상이 아니다. 코드상 판매 차단 효과는 inactive 와 같지만
 * (getMealProducts / startMealPayment), 품절은 구매자 귀책이 아니므로 이미 결제한 건의
 * 환불까지 막지 않는다. variant.status(옵션 소프트 삭제)도 같은 이유로 보지 않는다.
 */
export function canCancelOrder(input: {
  category: 'meal' | 'exam';
  variantKind: 'one_time' | 'recurring';
  productStart: string;
  productStatus: 'active' | 'inactive' | 'sold_out';
  /** 결제 시각(paid_at). 없으면 주문 생성 시각. 정책 시행일 비교에만 쓴다. */
  purchasedAt: string | null;
}): CancelDecision {
  if (input.category === 'exam') return { ok: false, reason: 'exam' };

  const today = getTodayKST();

  if (input.variantKind === 'recurring') {
    const start = new Date(`${input.productStart}T12:00:00+09:00`);
    const friday = subDays(start, 3);
    const fridayStr = friday.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    if (today > fridayStr) return { ok: false, reason: 'recurring_deadline' };
  } else {
    const productStart = new Date(`${input.productStart}T12:00:00+09:00`);
    const deadline = subDays(productStart, 2);
    const deadlineStr = deadline.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    if (today > deadlineStr) return { ok: false, reason: 'one_time_deadline' };
  }

  // 정책 시행 전에 결제된 주문은 결제 당시 약관대로 둔다(소급 적용 없음).
  const purchasedAtMs = input.purchasedAt ? new Date(input.purchasedAt).getTime() : NaN;
  const isAfterPolicy =
    Number.isNaN(purchasedAtMs) || purchasedAtMs >= INACTIVE_REFUND_BLOCK_EFFECTIVE_AT;

  if (isAfterPolicy && input.productStatus === 'inactive') {
    return { ok: false, reason: 'product_inactive' };
  }

  return { ok: true };
}

export function cancelReasonMessage(reason: CancelReason): string {
  switch (reason) {
    case 'exam':
      return '모의고사는 결제 후 취소가 불가합니다.';
    case 'recurring_deadline':
      return '정기 메뉴는 이용 직전 주 금요일까지만 취소할 수 있습니다.';
    case 'one_time_deadline':
      return '일일 메뉴는 이용일 2일 전까지만 취소할 수 있습니다.';
    case 'product_inactive':
      return '판매가 중지된 상품입니다. 환불은 지점으로 문의해 주세요.';
  }
}
