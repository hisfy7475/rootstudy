import { getDashboardStudents } from '@/lib/actions/admin';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import { DashboardClient } from './dashboard-client';

interface PageProps {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
    size?: string;
    sort?: string;
    dir?: string;
  }>;
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

  const parsed = parseListParams(raw, {
    defaultSort: 'seat_number',
    defaultDir: 'asc',
    defaultPageSize: 50,
    sortAllowlist: ['seat_number', 'name'] as const,
    filterAllowlist: ['status'] as const,
    pageSizeChoices: [20, 50, 100],
  });

  const result = await getDashboardStudents({
    q: parsed.q,
    page: parsed.page,
    pageSize: parsed.pageSize,
    sort: parsed.sort,
    dir: parsed.dir,
    status: statusFilter,
    branchId,
  });

  return (
    <DashboardClient
      initialRows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      stats={result.stats}
      branchId={branchId}
      initialStatusFilter={statusFilter ?? 'all'}
      initialQ={parsed.q}
    />
  );
}
