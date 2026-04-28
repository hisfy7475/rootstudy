import { subDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';

export type CancelReason = 'exam' | 'recurring_deadline' | 'one_time_deadline';

export type CancelDecision = { ok: true } | { ok: false; reason: CancelReason };

/**
 * 주문 취소 가능 여부 판정.
 *
 * - 모의고사(category='exam'): 결제 후 즉시 취소 불가
 * - 정기 메뉴(kind='recurring'): 식사 시작 월요일의 직전 주 금요일까지 취소 가능
 *   (start_date - 3일 = 직전 금요일. 일자 단위 비교로 자정 경계 자연 처리)
 * - 일일 메뉴(kind='one_time'): 식사일 2일 전까지 취소 가능
 */
export function canCancelOrder(input: {
  category: 'meal' | 'exam';
  variantKind: 'one_time' | 'recurring';
  productStart: string;
}): CancelDecision {
  if (input.category === 'exam') return { ok: false, reason: 'exam' };

  const today = getTodayKST();

  if (input.variantKind === 'recurring') {
    const start = new Date(`${input.productStart}T12:00:00+09:00`);
    const friday = subDays(start, 3);
    const fridayStr = friday.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    return today <= fridayStr ? { ok: true } : { ok: false, reason: 'recurring_deadline' };
  }

  const productStart = new Date(`${input.productStart}T12:00:00+09:00`);
  const deadline = subDays(productStart, 2);
  const deadlineStr = deadline.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  return today <= deadlineStr ? { ok: true } : { ok: false, reason: 'one_time_deadline' };
}

export function cancelReasonMessage(reason: CancelReason): string {
  switch (reason) {
    case 'exam':
      return '모의고사는 결제 후 취소가 불가합니다.';
    case 'recurring_deadline':
      return '정기 메뉴는 이용 직전 주 금요일까지만 취소할 수 있습니다.';
    case 'one_time_deadline':
      return '일일 메뉴는 이용일 2일 전까지만 취소할 수 있습니다.';
  }
}
