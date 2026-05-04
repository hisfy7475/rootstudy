import {
  getAllAbsenceSchedules,
  getPendingAbsenceSchedulesForAdmin,
} from '@/lib/actions/absence-schedule';
import { createClient } from '@/lib/supabase/server';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { parseListParams } from '@/lib/list-params';
import SchedulesClient from './schedules-client';

interface PageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    active?: string;
    page?: string;
    size?: string;
  }>;
}

export default async function AdminSchedulesPage({ searchParams }: PageProps) {
  const ctx = await requireAdminBranch();
  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }
  const { branchId } = ctx;
  const supabase = await createClient();
  const raw = await searchParams;

  const parsed = parseListParams(raw, {
    defaultSort: 'created_at',
    defaultDir: 'desc',
    defaultPageSize: 20,
    sortAllowlist: ['created_at'] as const,
    filterAllowlist: ['type', 'active'] as const,
  });

  const typeFilter =
    parsed.filters.type === 'recurring' || parsed.filters.type === 'one_time'
      ? parsed.filters.type
      : undefined;
  const activeFilter =
    parsed.filters.active === 'active' || parsed.filters.active === 'inactive'
      ? parsed.filters.active
      : undefined;

  // 해당 지점 학생만 조회 (branch_id 기반 SQL 필터)
  async function getBranchStudents() {
    const { data, error } = await supabase
      .from('student_profiles')
      .select('id, seat_number, profiles!inner(name, branch_id)')
      .eq('profiles.branch_id', branchId)
      .order('seat_number', { ascending: true });

    if (error || !data) return [];

    return data.map((s) => {
      const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      return {
        id: s.id,
        name: (profile as { name: string }).name,
        seatNumber: s.seat_number as number | null,
      };
    });
  }

  const [scheduleResult, pendingSchedules, studentList] = await Promise.all([
    getAllAbsenceSchedules({
      branchId,
      q: parsed.q,
      page: parsed.page,
      pageSize: parsed.pageSize,
      type: typeFilter,
      active: activeFilter,
    }),
    getPendingAbsenceSchedulesForAdmin(branchId),
    getBranchStudents(),
  ]);

  return (
    <SchedulesClient
      initialSchedules={scheduleResult.rows}
      total={scheduleResult.total}
      page={scheduleResult.page}
      pageSize={scheduleResult.pageSize}
      pendingSchedules={pendingSchedules}
      students={studentList}
      branchId={branchId}
    />
  );
}
