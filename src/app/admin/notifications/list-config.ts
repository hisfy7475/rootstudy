import type { ListParamsConfig } from '@/lib/list-params';

export type NotificationsSortKey = 'sent_at';
export type NotificationsFilterKey = 'type';

export const NOTIFICATIONS_LIST_CONFIG: ListParamsConfig<
  NotificationsSortKey,
  NotificationsFilterKey
> = {
  defaultSort: 'sent_at',
  defaultDir: 'desc',
  defaultPageSize: 20,
  sortAllowlist: ['sent_at'] as const,
  filterAllowlist: ['type'] as const,
  pageSizeChoices: [20, 50, 100] as const,
};
