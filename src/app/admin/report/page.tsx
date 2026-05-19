import { getStudentsForReport } from '@/lib/actions/report';
import { getAllBranches } from '@/lib/actions/branch';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { formatDateKST, getWeekStart } from '@/lib/utils';
import { AdminReportClient } from './report-client';

export default async function AdminReportPage() {
  const ctx = await requireAdminBranch();
  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  // 슈퍼관리자(branchId === null)는 전 지점 학생.
  const [students, branches] = await Promise.all([
    getStudentsForReport(ctx.branchId ?? undefined),
    ctx.isSuperAdmin ? getAllBranches() : Promise.resolve([]),
  ]);
  const weekStartStr = formatDateKST(getWeekStart());

  return (
    <AdminReportClient
      students={students}
      initialWeekStart={weekStartStr}
      branchId={ctx.branchId}
      isSuperAdmin={ctx.isSuperAdmin}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
    />
  );
}
