import { getAllStudents, getWeeklyFocusReport, getPenaltyPresets, getFocusScorePresets, getTodayFocusScoresByPeriod } from '@/lib/actions/admin';
import { getTodayPeriods } from '@/lib/actions/period';
import { createClient } from '@/lib/supabase/server';
import { FocusClient } from './focus-client';

export default async function FocusManagementPage() {
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

  // branch_id가 없으면 첫 번째 활성 지점 사용
  if (!branchId) {
    const { data: firstBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    branchId = firstBranch?.id || null;
  }

  // 오늘 날짜
  const today = new Date().toISOString().split('T')[0];

  const [students, report, todayPeriodsData, penaltyPresets, focusPresets, focusScoresByPeriod] = await Promise.all([
    getAllStudents('all'),
    getWeeklyFocusReport(branchId),
    branchId ? getTodayPeriods(branchId) : Promise.resolve({ periods: [], dateTypeName: null, dateTypeId: null }),
    branchId ? getPenaltyPresets(branchId) : Promise.resolve([]),
    branchId ? getFocusScorePresets(branchId) : Promise.resolve([]),
    getTodayFocusScoresByPeriod(branchId),
  ]);

  return (
    <FocusClient 
      initialStudents={students} 
      initialReport={report}
      todayPeriods={todayPeriodsData.periods}
      dateTypeName={todayPeriodsData.dateTypeName}
      todayDate={today}
      branchId={branchId}
      initialPenaltyPresets={penaltyPresets}
      initialFocusPresets={focusPresets}
      initialFocusScoresByPeriod={focusScoresByPeriod}
    />
  );
}
