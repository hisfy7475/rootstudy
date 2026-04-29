import { getAllMembers, getAllAdmins, getAllParentsWithStudents } from '@/lib/actions/admin';
import { getAllBranches } from '@/lib/actions/branch';
import { getStudentTypes } from '@/lib/actions/student-type';
import { requireAdminBranch } from '@/lib/auth/admin-context';
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

  const { branchId } = ctx;

  const [members, admins, branches, parentsWithStudents, studentTypes] = await Promise.all([
    getAllMembers(undefined, branchId),
    getAllAdmins(branchId),
    getAllBranches(),
    getAllParentsWithStudents(branchId),
    getStudentTypes(),
  ]);

  const students = members.filter((m) => m.user_type === 'student');

  let initialStudentTypeFilter: StudentTypeFilterValue = 'all';
  if (raw.studentType === 'unassigned') {
    initialStudentTypeFilter = 'unassigned';
  } else if (raw.studentType && studentTypes.some((t) => t.id === raw.studentType)) {
    initialStudentTypeFilter = raw.studentType;
  }

  const initialTab: Tab = (VALID_TABS as readonly string[]).includes(raw.tab ?? '')
    ? (raw.tab as Tab)
    : 'students';

  const initialApproval =
    raw.approval === 'pending' || raw.approval === 'approved' || raw.approval === 'rejected'
      ? raw.approval
      : 'all';

  return (
    <MembersClient
      initialStudents={students}
      initialParents={parentsWithStudents}
      initialAdmins={admins}
      branches={branches}
      initialStudentTypes={studentTypes.map((t) => ({ id: t.id, name: t.name }))}
      branchId={branchId}
      initialStudentTypeFilter={initialStudentTypeFilter}
      initialTab={initialTab}
      initialApproval={initialApproval}
      initialQ={raw.q ?? ''}
    />
  );
}
