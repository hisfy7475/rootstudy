import type { ListParamsConfig } from '@/lib/list-params';

export type PointsHistorySortKey = 'created_at' | 'amount';
export type PointsHistoryFilterKey = 'type' | 'studentId';

export const POINTS_HISTORY_LIST_CONFIG: ListParamsConfig<
  PointsHistorySortKey,
  PointsHistoryFilterKey
> = {
  defaultSort: 'created_at',
  defaultDir: 'desc',
  defaultPageSize: 20,
  sortAllowlist: ['created_at', 'amount'] as const,
  filterAllowlist: ['type', 'studentId'] as const,
  pageSizeChoices: [20, 50, 100] as const,
};

export const POINTS_TABS = ['overview', 'history', 'rules'] as const;
export type PointsTab = (typeof POINTS_TABS)[number];

export function parseTab(value: string | undefined | null): PointsTab {
  return (POINTS_TABS as readonly string[]).includes(value ?? '')
    ? (value as PointsTab)
    : 'overview';
}
