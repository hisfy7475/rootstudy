import { redirect } from 'next/navigation';
import { getAllBranches, getBranchStudentCounts } from '@/lib/actions/branch';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import BranchesClient from './branches-client';

export default async function BranchesPage() {
  const ctx = await requireAdminBranch();
  if (!ctx || !ctx.isSuperAdmin) redirect('/admin');

  const [branches, studentCounts] = await Promise.all([
    getAllBranches(true), // 비활성 포함
    getBranchStudentCounts(),
  ]);

  // 학생 수 매핑
  const branchesWithCount = branches.map((branch) => {
    const countData = studentCounts.find((c) => c.branchId === branch.id);
    return {
      ...branch,
      studentCount: countData?.count || 0,
    };
  });

  return <BranchesClient initialBranches={branchesWithCount} isSuperAdmin />;
}
