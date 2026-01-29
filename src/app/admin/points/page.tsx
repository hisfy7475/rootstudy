import { getPointsOverview, getAllPointsHistory, getAllStudents, getRewardPresets, getPenaltyPresets } from '@/lib/actions/admin';
import { createClient } from '@/lib/supabase/server';
import { PointsClient } from './points-client';

export default async function PointsManagementPage() {
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

  const [overview, history, students, rewardPresets, penaltyPresets] = await Promise.all([
    getPointsOverview(),
    getAllPointsHistory(),
    getAllStudents(),
    branchId ? getRewardPresets(branchId) : Promise.resolve([]),
    branchId ? getPenaltyPresets(branchId) : Promise.resolve([]),
  ]);

  return (
    <PointsClient 
      initialOverview={overview} 
      initialHistory={history} 
      students={students}
      branchId={branchId}
      initialRewardPresets={rewardPresets}
      initialPenaltyPresets={penaltyPresets}
    />
  );
}
