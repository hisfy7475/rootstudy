import { getAllBranches } from '@/lib/actions/branch';
import { getDateTypeDefinitions, getDateAssignments } from '@/lib/actions/date-type';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { formatDateKST } from '@/lib/utils';
import DateTypesClient from './date-types-client';

export default async function DateTypesPage() {
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
  let assignments: Awaited<ReturnType<typeof getDateAssignments>> = [];

  if (initialBranch) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    [dateTypes, assignments] = await Promise.all([
      getDateTypeDefinitions(initialBranch.id),
      getDateAssignments(initialBranch.id, formatDateKST(startOfMonth), formatDateKST(endOfMonth)),
    ]);
  }

  return (
    <DateTypesClient
      branches={branches}
      initialDateTypes={dateTypes}
      initialAssignments={assignments}
      initialBranchId={initialBranch?.id ?? ''}
    />
  );
}
