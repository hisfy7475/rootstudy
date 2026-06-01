import {
  getPointsOverview,
  getAllPointsHistory,
  getAllStudents,
  getRewardPresets,
  getPenaltyPresets,
  getWithdrawalReviewQueue,
  getRedemptionQueue,
} from '@/lib/actions/admin';
import { getAllBranches } from '@/lib/actions/branch';
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

  const [
    overview,
    history,
    students,
    rewardPresets,
    penaltyPresets,
    reviewQueue,
    requiredQueue,
    redemptionQueue,
    branches,
  ] = await Promise.all([
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
    getWithdrawalReviewQueue(branchId, 'review'),
    getWithdrawalReviewQueue(branchId, 'required'),
    getRedemptionQueue(branchId),
    // 슈퍼관리자(전 지점)는 규정이 지점별로 합쳐 보이므로 지점명 뱃지용 맵을 함께 전달
    branchId ? Promise.resolve([]) : getAllBranches(true),
  ]);

  const branchNameById: Record<string, string> = {};
  for (const b of branches) branchNameById[b.id] = b.name;

  return (
    <PointsClient
      activeTab={tab}
      initialOverview={overview}
      initialHistoryResult={history}
      students={students}
      branchId={branchId}
      branchNameById={branchNameById}
      initialRewardPresets={rewardPresets}
      initialPenaltyPresets={penaltyPresets}
      initialReviewQueue={reviewQueue}
      initialRequiredQueue={requiredQueue}
      initialRedemptionQueue={redemptionQueue}
    />
  );
}
