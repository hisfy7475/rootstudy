import {
  getUnifiedApplicationsForAdmin,
  type UnifiedAppDomain,
  type UnifiedAppStatus,
} from '@/lib/actions/unified-applications';
import { getAllBranches } from '@/lib/actions/branch';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import { ApplicationsClient } from './applications-client';

const FILTER_KEYS = ['domain', 'status', 'from', 'to', 'q', 'branchId'] as const;
const SORT_KEYS = ['applied_at', 'amount', 'service_start_date'] as const;

const VALID_DOMAINS: UnifiedAppDomain[] = ['meal', 'exam', 'mentoring'];
const VALID_STATUSES: UnifiedAppStatus[] = [
  'pending',
  'completed',
  'cancelled',
  'rejected',
  'refunded',
  'failed',
  'unknown',
];

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminApplicationsPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const ctx = await requireAdminBranch();
  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  const params = parseListParams(raw, {
    defaultSort: 'service_start_date',
    defaultDir: 'desc',
    defaultPageSize: 20,
    sortAllowlist: SORT_KEYS,
    filterAllowlist: FILTER_KEYS,
    pageSizeChoices: [20, 50, 100],
  });

  const domainParam = params.filters.domain;
  const statusParam = params.filters.status;
  const fromParam = params.filters.from;
  const toParam = params.filters.to;
  const branchIdParam = params.filters.branchId;

  const domain =
    domainParam && (VALID_DOMAINS as string[]).includes(domainParam)
      ? (domainParam as UnifiedAppDomain)
      : undefined;
  const status =
    statusParam && (VALID_STATUSES as string[]).includes(statusParam)
      ? (statusParam as UnifiedAppStatus)
      : undefined;
  const fromDate = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : undefined;
  const toDate = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : undefined;
  const branchId = ctx.isSuperAdmin && branchIdParam ? branchIdParam : undefined;

  const filters = {
    domain,
    status,
    branchId,
    fromDate,
    toDate,
    q: params.q || undefined,
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    dir: params.dir,
  };

  const [page, branches] = await Promise.all([
    getUnifiedApplicationsForAdmin(filters),
    ctx.isSuperAdmin ? getAllBranches() : Promise.resolve([]),
  ]);

  return (
    <div className='space-y-6 p-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>통합 신청내역</h1>
        <p className='text-muted-foreground mt-1 text-sm'>
          급식·모의고사·멘토링 신청을 한 화면에서 조회하고 엑셀로 내보냅니다.
        </p>
      </div>
      <ApplicationsClient
        initialResult={page}
        initialFilters={{
          domain,
          status,
          branchId,
          fromDate: fromDate ?? '',
          toDate: toDate ?? '',
          q: params.q ?? '',
        }}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
        isSuperAdmin={ctx.isSuperAdmin}
      />
    </div>
  );
}
