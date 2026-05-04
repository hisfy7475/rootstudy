import { getWithdrawnMembers } from '@/lib/actions/admin';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import { WithdrawnMembersClient } from './withdrawn-client';

interface PageProps {
  searchParams: Promise<{
    q?: string;
    page?: string;
    size?: string;
  }>;
}

export default async function WithdrawnMembersPage({ searchParams }: PageProps) {
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

  const parsed = parseListParams(raw, {
    defaultSort: 'withdrawn_at',
    defaultDir: 'desc',
    defaultPageSize: 30,
    sortAllowlist: ['withdrawn_at'] as const,
    filterAllowlist: [] as const,
    pageSizeChoices: [20, 30, 50, 100],
  });

  const result = await getWithdrawnMembers({
    branchId,
    q: parsed.q,
    page: parsed.page,
    pageSize: parsed.pageSize,
  });

  return (
    <WithdrawnMembersClient
      rows={result.rows}
      total={result.total}
      page={parsed.page}
      pageSize={parsed.pageSize}
    />
  );
}
