import type { ListParamsConfig } from '@/lib/list-params';

export type NotificationsSortKey = 'created_at';
// 'branch' 는 슈퍼 관리자 전용 지점 필터(일반 관리자는 page.tsx 에서 무시).
export type NotificationsFilterKey = 'recipientType' | 'type' | 'period' | 'branch';

export const NOTIFICATIONS_LIST_CONFIG: ListParamsConfig<
  NotificationsSortKey,
  NotificationsFilterKey
> = {
  defaultSort: 'created_at',
  defaultDir: 'desc',
  defaultPageSize: 20,
  sortAllowlist: ['created_at'] as const,
  filterAllowlist: ['recipientType', 'type', 'period', 'branch'] as const,
  pageSizeChoices: [20, 50, 100] as const,
};
