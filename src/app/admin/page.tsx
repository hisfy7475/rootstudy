import { getAllStudents } from '@/lib/actions/admin';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { DashboardClient } from './dashboard-client';

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string }>;
}

export default async function AdminDashboard({ searchParams }: PageProps) {
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
  const statusFilter =
    raw.status === 'checked_in' || raw.status === 'checked_out' || raw.status === 'on_break'
      ? raw.status
      : undefined;

  const students = await getAllStudents(undefined, branchId);

  return (
    <DashboardClient
      initialStudents={students}
      branchId={branchId}
      initialStatusFilter={statusFilter ?? 'all'}
      initialQ={raw.q ?? ''}
    />
  );
}
