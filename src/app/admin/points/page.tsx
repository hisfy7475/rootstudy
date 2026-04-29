import {
  getPointsOverview,
  getAllPointsHistory,
  getAllStudents,
  getRewardPresets,
  getPenaltyPresets,
} from '@/lib/actions/admin';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import { POINTS_HISTORY_LIST_CONFIG, parseTab } from './list-config';
import { PointsClient } from './points-client';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PointsManagementPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const ctx = await requireAdminBranch();

  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  const { branchId } = ctx;

  const tab = parseTab(typeof raw.tab === 'string' ? raw.tab : undefined);
  const params = parseListParams(raw, POINTS_HISTORY_LIST_CONFIG);

  const [overview, history, students, rewardPresets, penaltyPresets] = await Promise.all([
    getPointsOverview({ branchId }),
    getAllPointsHistory({
      branchId,
      page: params.page,
      pageSize: params.pageSize,
      q: params.q,
      sort: params.sort,
      dir: params.dir,
      type:
        params.filters.type === 'reward' || params.filters.type === 'penalty'
          ? params.filters.type
          : undefined,
      studentId: params.filters.studentId,
    }),
    getAllStudents('all', branchId),
    getRewardPresets(branchId),
    getPenaltyPresets(branchId),
  ]);

  return (
    <PointsClient
      activeTab={tab}
      initialOverview={overview}
      initialHistoryResult={history}
      students={students}
      branchId={branchId}
      initialRewardPresets={rewardPresets}
      initialPenaltyPresets={penaltyPresets}
    />
  );
}
