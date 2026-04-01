import { createClient } from '@/lib/supabase/server';
import {
  getImmersionReportData,
  getWeeklyStudyTrend,
} from '@/lib/actions/report';
import { getWeekStart, formatDateKST } from '@/lib/utils';
import { StudentReportClient } from './report-client';

export default async function StudentReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const weekStart = getWeekStart();
  const weekStartStr = formatDateKST(weekStart);
  const currentWeekMondayStr = weekStartStr;

  const [report, trend] = await Promise.all([
    getImmersionReportData(user.id, weekStartStr),
    getWeeklyStudyTrend(user.id, 8),
  ]);

  return (
    <StudentReportClient
      studentId={user.id}
      initialReport={report}
      initialTrend={trend}
      initialWeekStart={weekStartStr}
      currentWeekMondayStr={currentWeekMondayStr}
    />
  );
}
