import { getTodayFocus, getWeeklyFocus } from '@/lib/actions/student';
import { FocusPageClient } from './focus-client';
import { startOfWeek, addDays, format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default async function FocusPage() {
  const [todayFocusData, weeklyFocusData] = await Promise.all([
    getTodayFocus(),
    getWeeklyFocus(),
  ]);

  // 오늘의 평균 점수 계산
  const todayAvg = todayFocusData.length > 0
    ? todayFocusData.reduce((sum, f) => sum + f.score, 0) / todayFocusData.length
    : null;

  // 주간 데이터 가공
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const dayScores = weeklyFocusData.filter(f => 
      format(new Date(f.recorded_at), 'yyyy-MM-dd') === dateStr
    );
    
    const avgScore = dayScores.length > 0
      ? dayScores.reduce((sum, f) => sum + f.score, 0) / dayScores.length
      : null;

    return {
      date: dateStr,
      dayLabel: format(date, 'EEE', { locale: ko }),
      avgScore,
    };
  });

  // 어제 평균 점수 (비교용)
  const yesterday = addDays(today, -1);
  const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
  const yesterdayScores = weeklyFocusData.filter(f =>
    format(new Date(f.recorded_at), 'yyyy-MM-dd') === yesterdayStr
  );
  const yesterdayAvg = yesterdayScores.length > 0
    ? yesterdayScores.reduce((sum, f) => sum + f.score, 0) / yesterdayScores.length
    : null;

  // 오늘의 상세 기록
  const todayDetails = todayFocusData.map(f => ({
    id: f.id,
    score: f.score,
    note: f.note,
    recordedAt: f.recorded_at,
  }));

  // 가장 최근 기록의 활동 상태
  const latestActivity = todayFocusData.length > 0
    ? todayFocusData[todayFocusData.length - 1]?.note || null
    : null;

  return (
    <FocusPageClient
      todayScore={todayAvg}
      previousScore={yesterdayAvg}
      weeklyData={weeklyData}
      todayDetails={todayDetails}
      latestActivity={latestActivity}
    />
  );
}
