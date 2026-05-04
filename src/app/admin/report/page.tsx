import { getStudentsForReport } from '@/lib/actions/report';
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
  const students = await getStudentsForReport(ctx.branchId ?? undefined);
  const weekStartStr = formatDateKST(getWeekStart());

  return (
    <AdminReportClient
      students={students}
      initialWeekStart={weekStartStr}
      branchId={ctx.branchId}
    />
  );
}
