import { 
  getAllAbsenceSchedules, 
  getPendingAbsenceSchedulesForAdmin 
} from '@/lib/actions/absence-schedule';
import { createClient } from '@/lib/supabase/server';
import SchedulesClient from './schedules-client';

export default async function AdminSchedulesPage() {
  const supabase = await createClient();

  // 현재 로그인한 관리자의 branch_id 조회
  const { data: { user } } = await supabase.auth.getUser();
  let branchId: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', user.id)
      .single();
    branchId = profile?.branch_id || null;
  }

  // 해당 지점 학생만 조회 (branch_id 기반 직접 필터링)
  async function getBranchStudents() {
    let query = supabase
      .from('student_profiles')
      .select('id, seat_number, profiles!inner(name, branch_id)')
      .order('seat_number', { ascending: true });

    if (branchId) {
      query = query.eq('profiles.branch_id', branchId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data
      .filter(s => {
        const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
        return !branchId || profile?.branch_id === branchId;
      })
      .map(s => {
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
