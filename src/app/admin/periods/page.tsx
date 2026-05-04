import { getAllBranches } from '@/lib/actions/branch';
import { getDateTypeDefinitions } from '@/lib/actions/date-type';
import { getPeriodDefinitions } from '@/lib/actions/period';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import PeriodsClient from './periods-client';

export default async function PeriodsPage() {
  const ctx = await requireAdminBranch();
  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  const branches = await getAllBranches();

  // SSR 초기 지점: 어드민 본인 지점 우선, 없으면(슈퍼관리자 home 미지정 등) 첫 번째 지점.
  const initialBranch = ctx.branchId
    ? (branches.find((b) => b.id === ctx.branchId) ?? branches[0])
    : branches[0];

  let dateTypes: Awaited<ReturnType<typeof getDateTypeDefinitions>> = [];
  let periods: Awaited<ReturnType<typeof getPeriodDefinitions>> = [];

  if (initialBranch) {
    dateTypes = await getDateTypeDefinitions(initialBranch.id);
    periods = await getPeriodDefinitions(initialBranch.id);
  }

  return (
    <PeriodsClient
      branches={branches}
      initialDateTypes={dateTypes}
      initialPeriods={periods}
      initialBranchId={initialBranch?.id ?? ''}
    />
  );
}
