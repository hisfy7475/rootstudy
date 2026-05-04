import { getStudentTypes, getStudentTypeStudentCounts } from '@/lib/actions/student-type';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import StudentTypesClient from './student-types-client';

export default async function StudentTypesPage() {
  const ctx = await requireAdminBranch();
  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }
  // 슈퍼관리자(branchId === null)는 전 지점 카운트.
  const adminBranchId = ctx.branchId;

  const [studentTypes, studentCounts] = await Promise.all([
    getStudentTypes(),
    getStudentTypeStudentCounts(adminBranchId),
  ]);

  // 학생 수 매핑
  const typesWithCount = studentTypes.map((type) => ({
    ...type,
    studentCount: studentCounts[type.id] || 0,
  }));

  const unassignedCount = studentCounts['unassigned'] || 0;

  return (
    <StudentTypesClient
      initialTypes={typesWithCount}
      adminBranchId={adminBranchId}
      unassignedCount={unassignedCount}
    />
  );
}
