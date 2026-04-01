import { subDays } from 'date-fns';
import { getTodayKST } from '@/lib/utils';

/**
 * 식사일 기준 2일 전까지 취소 가능 (KST 달력일).
 * 예: 식사 3/10이면 3/8까지 취소 가능(3/9부터 불가).
 */
export function canCancelMealOrderByDeadline(mealStartDateYmd: string): boolean {
  const today = getTodayKST();
  const mealNoon = new Date(`${mealStartDateYmd}T12:00:00+09:00`);
  const deadline = subDays(mealNoon, 2);
  const deadlineStr = deadline.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  return today <= deadlineStr;
}
