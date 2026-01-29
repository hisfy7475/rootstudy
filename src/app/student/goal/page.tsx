import { getTodayGoal, getWeeklyGoals } from '@/lib/actions/student';
import { createClient } from '@/lib/supabase/server';
import { GoalPageClient } from './goal-client';

export default async function GoalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return <div className="p-4">로그인이 필요합니다.</div>;
  }

  // 이번 주 목표 데이터 조회
  const today = new Date();
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);

  const { data: weeklyGoals } = await supabase
    .from('study_goals')
    .select('*')
    .eq('student_id', user.id)
    .gte('date', startOfWeek.toISOString().split('T')[0])
    .order('date', { ascending: true });

  // 7일간의 데이터 생성
  const goalDays = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    const goal = weeklyGoals?.find(g => g.date === dateStr);
    goalDays.push({
      date: dateStr,
      targetTime: goal?.target_time || null,
      achieved: goal?.achieved ?? null,
    });
  }

  // 오늘의 목표
  const todayStr = today.toISOString().split('T')[0];
  const todayGoal = weeklyGoals?.find(g => g.date === todayStr);

  return (
    <GoalPageClient 
      goals={goalDays}
      todayGoal={todayGoal ? {
        targetTime: todayGoal.target_time,
        achieved: todayGoal.achieved,
      } : null}
    />
  );
}
