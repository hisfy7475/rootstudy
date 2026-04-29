import type { ListParamsConfig } from '@/lib/list-params';

export type AnnouncementsSortKey = 'created_at';
export type AnnouncementsFilterKey = 'audience' | 'important';

export const ANNOUNCEMENTS_LIST_CONFIG: ListParamsConfig<
  AnnouncementsSortKey,
  AnnouncementsFilterKey
> = {
  defaultSort: 'created_at',
  defaultDir: 'desc',
  defaultPageSize: 20,
  sortAllowlist: ['created_at'] as const,
  filterAllowlist: ['audience', 'important'] as const,
  pageSizeChoices: [20, 50, 100] as const,
};
