import { redirect } from 'next/navigation';
import {
  getMembersAggregates,
  getMembersList,
  getParentsList,
  getAdminsList,
} from '@/lib/actions/admin';
import { getAllBranches } from '@/lib/actions/branch';
import { getStudentTypes } from '@/lib/actions/student-type';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import type { StudentTypeFilterValue } from './members-client';
import { MembersClient } from './members-client';

const VALID_TABS = ['students', 'parents', 'admins'] as const;
type Tab = (typeof VALID_TABS)[number];

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    studentType?: string;
    approval?: string;
    q?: string;
    page?: string;
    size?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function MembersManagementPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const ctx = await requireAdminBranch();

  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }

  const { branchId, isSuperAdmin } = ctx;

  // 관리자 탭은 최고 관리자 전용. 일반 관리자가 URL 직접 접근 시 students 탭으로 강제.
  if (raw.tab === 'admins' && !isSuperAdmin) {
    redirect('/admin/members?tab=students');
  }

  const tab: Tab = (VALID_TABS as readonly string[]).includes(raw.tab ?? '')
    ? (raw.tab as Tab)
    : 'students';

  const approval =
    raw.approval === 'pending' || raw.approval === 'approved' || raw.approval === 'rejected'
      ? raw.approval
      : 'all';

  // 학생 탭: sort/dir 화이트리스트 적용
  const parsed = parseListParams(raw, {
    defaultSort: 'created_at',
    defaultDir: 'desc',
    defaultPageSize: 30,
    sortAllowlist: ['seat_number', 'name', 'branch_name', 'created_at'] as const,
    filterAllowlist: ['approval', 'studentType'] as const,
    pageSizeChoices: [20, 30, 50, 100],
  });

  const [branches, studentTypes] = await Promise.all([getAllBranches(), getStudentTypes()]);

  let initialStudentTypeFilter: StudentTypeFilterValue = 'all';
  if (raw.studentType === 'unassigned') {
    initialStudentTypeFilter = 'unassigned';
  } else if (raw.studentType && studentTypes.some((t) => t.id === raw.studentType)) {
    initialStudentTypeFilter = raw.studentType;
  }

  // aggregates: 그룹별 자기 무시 정책으로 q/approval/studentType 반영
  const aggregates = await getMembersAggregates({
    branchId,
    q: parsed.q,
    approval: approval === 'all' ? undefined : approval,
    studentType: initialStudentTypeFilter === 'all' ? undefined : initialStudentTypeFilter,
  });

  // 활성 탭만 페이지 데이터 로드 (다른 탭은 빈 배열 — 탭 전환 시 URL 갱신으로 재실행)
  const studentsResult =
    tab === 'students'
      ? await getMembersList({
          branchId,
          q: parsed.q,
          page: parsed.page,
          pageSize: parsed.pageSize,
          approval: approval === 'all' ? undefined : approval,
          studentType: initialStudentTypeFilter === 'all' ? undefined : initialStudentTypeFilter,
          sort: parsed.sort,
          dir: parsed.dir,
        })
      : { rows: [], total: 0, page: parsed.page, pageSize: parsed.pageSize };

  const parentsResult =
    tab === 'parents'
      ? await getParentsList({
          branchId,
          q: parsed.q,
          page: parsed.page,
          pageSize: parsed.pageSize,
        })
      : { rows: [], total: 0, page: parsed.page, pageSize: parsed.pageSize };

  const adminsResult =
    tab === 'admins'
      ? await getAdminsList({
          branchId,
          q: parsed.q,
          page: parsed.page,
          pageSize: parsed.pageSize,
        })
      : { rows: [], total: 0, page: parsed.page, pageSize: parsed.pageSize };

  return (
    <MembersClient
      students={studentsResult.rows}
      studentsTotal={studentsResult.total}
      parents={parentsResult.rows}
      parentsTotal={parentsResult.total}
      admins={adminsResult.rows}
      adminsTotal={adminsResult.total}
      page={parsed.page}
      pageSize={parsed.pageSize}
      sort={parsed.sort}
      dir={parsed.dir}
      branches={branches}
      studentTypes={studentTypes.map((t) => ({ id: t.id, name: t.name }))}
      branchId={branchId}
      tab={tab}
      approval={approval}
      studentTypeFilter={initialStudentTypeFilter}
      q={parsed.q}
      aggregates={aggregates}
      currentIsSuperAdmin={isSuperAdmin}
    />
  );
}
