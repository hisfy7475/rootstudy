import {
  getAllAbsenceSchedules,
  getPendingAbsenceSchedulesForAdmin,
} from '@/lib/actions/absence-schedule';
import { createClient } from '@/lib/supabase/server';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import SchedulesClient from './schedules-client';

export default async function AdminSchedulesPage() {
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

  const [schedules, pendingSchedules, studentList] = await Promise.all([
    getAllAbsenceSchedules(branchId),
    getPendingAbsenceSchedulesForAdmin(branchId),
    getBranchStudents(),
  ]);

  return (
    <SchedulesClient
      initialSchedules={schedules}
      pendingSchedules={pendingSchedules}
      students={studentList}
      branchId={branchId}
    />
  );
}
