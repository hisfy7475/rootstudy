import { createClient } from '@/lib/supabase/server';
import { 
  getStudyStatsByPeriod, 
  getSubjectStudyTime, 
  getDailyStudyTrend,
  getStudyComparison,
  getWeeklyProgress
} from '@/lib/actions/student';
import { getSubjectsForStudent } from '@/lib/actions/student-type';
import { StatsPageClient } from './stats-client';

export default async function StatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 오늘 통계 (기본값)
  const [
    dailyStats,
    subjectTime,
    weeklyTrend,
    comparison,
    weeklyProgress,
    availableSubjects
  ] = await Promise.all([
    getStudyStatsByPeriod('daily'),
    getSubjectStudyTime('daily'),
    getDailyStudyTrend('weekly'),
    getStudyComparison('daily'),
    getWeeklyProgress(),
    user ? getSubjectsForStudent(user.id) : [],
  ]);

  return (
    <StatsPageClient
      initialPeriod="daily"
      initialStats={{
        totalSeconds: dailyStats.totalSeconds,
        periodStart: dailyStats.periodStart,
        periodEnd: dailyStats.periodEnd,
      }}
      initialSubjectTime={{
        subjectTimes: subjectTime.subjectTimes,
        unclassifiedSeconds: subjectTime.unclassifiedSeconds,
        unclassifiedSegments: subjectTime.unclassifiedSegments,
      }}
      initialTrend={weeklyTrend}
      initialComparison={comparison}
      weeklyProgress={weeklyProgress}
      availableSubjects={availableSubjects.length > 0 ? availableSubjects : null}
    />
  );
}
