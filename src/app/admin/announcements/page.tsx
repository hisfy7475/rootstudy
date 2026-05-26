import { getAnnouncementsForAdmin, getAnnouncementStatsForAdmin } from '@/lib/actions/announcement';
// [알림톡 비활성화 2026-05-26]
// import { getAlimtalkConfig } from '@/lib/actions/notification';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import { ANNOUNCEMENTS_LIST_CONFIG } from './list-config';
import { AnnouncementsClient } from './announcements-client';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnnouncementsManagementPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const ctx = await requireAdminBranch();

  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  const params = parseListParams(raw, ANNOUNCEMENTS_LIST_CONFIG);

  const audienceFilter =
    params.filters.audience === 'all' ||
    params.filters.audience === 'student' ||
    params.filters.audience === 'parent'
      ? params.filters.audience
      : undefined;

  const importantFilter = params.filters.important === '1' ? true : undefined;

  const [result, stats] = await Promise.all([
    getAnnouncementsForAdmin({
      branchId: ctx.branchId,
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      audience: audienceFilter,
      important: importantFilter,
    }),
    getAnnouncementStatsForAdmin(ctx.branchId),
    // [알림톡 비활성화 2026-05-26] getAlimtalkConfig() 호출 제거
  ]);

  return (
    <AnnouncementsClient
      initialResult={result}
      stats={stats}
      // [알림톡 비활성화 2026-05-26]
      // alimtalkConfigured={alimtalkConfig.isConfigured}
    />
  );
}
