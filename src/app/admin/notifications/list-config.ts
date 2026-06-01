import type { ListParamsConfig } from '@/lib/list-params';

export type NotificationsSortKey = 'created_at';
export type NotificationsFilterKey = 'recipientType' | 'type' | 'period';

export const NOTIFICATIONS_LIST_CONFIG: ListParamsConfig<
  NotificationsSortKey,
  NotificationsFilterKey
> = {
  defaultSort: 'created_at',
  defaultDir: 'desc',
  defaultPageSize: 20,
  sortAllowlist: ['created_at'] as const,
  filterAllowlist: ['recipientType', 'type', 'period'] as const,
  pageSizeChoices: [20, 50, 100] as const,
};
