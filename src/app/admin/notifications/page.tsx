import { getNotifications, getNotificationStats } from '@/lib/actions/admin';
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

  const allowedTypes = ['late', 'absent', 'point', 'schedule', 'system'] as const;
  const typeFilter =
    params.filters.type && (allowedTypes as readonly string[]).includes(params.filters.type)
      ? (params.filters.type as (typeof allowedTypes)[number])
      : undefined;

  const [result, stats] = await Promise.all([
    getNotifications({
      branchId: ctx.branchId,
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      type: typeFilter,
    }),
    getNotificationStats(),
  ]);

  return <NotificationsClient initialResult={result} stats={stats} />;
}
