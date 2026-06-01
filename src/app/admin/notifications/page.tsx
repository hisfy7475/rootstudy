import {
  getAdminNotifications,
  getAdminNotificationStats,
  type NotificationPeriod,
  type NotificationRecipientType,
} from '@/lib/actions/admin';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import { NOTIFICATIONS_LIST_CONFIG } from './list-config';
import { NotificationsClient } from './notifications-client';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotificationsManagementPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const ctx = await requireAdminBranch();

  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  const params = parseListParams(raw, NOTIFICATIONS_LIST_CONFIG);

  // 필터값 화이트리스트 검증 — 잘못된 URL 값이 SQL .eq 로 새어들지 않도록.
  const allowedTypes = ['late', 'absent', 'point', 'schedule', 'system'] as const;
  const typeFilter =
    params.filters.type && (allowedTypes as readonly string[]).includes(params.filters.type)
      ? (params.filters.type as (typeof allowedTypes)[number])
      : undefined;

  const recipientFilter =
    params.filters.recipientType === 'student' || params.filters.recipientType === 'parent'
      ? (params.filters.recipientType as NotificationRecipientType)
      : undefined;

  const period: NotificationPeriod =
    params.filters.period === '30d' || params.filters.period === 'all'
      ? params.filters.period
      : '7d'; // 기본 최근 7일

  const [result, stats] = await Promise.all([
    getAdminNotifications({
      branchId: ctx.branchId,
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      recipientType: recipientFilter,
      type: typeFilter,
      period,
    }),
    getAdminNotificationStats(ctx.branchId, period),
  ]);

  return <NotificationsClient initialResult={result} stats={stats} />;
}
