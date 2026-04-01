import { getTodayAttendance, getTodayStudyTime, getWeeklyGoals, getCurrentSubject, getWeeklyProgress } from '@/lib/actions/student';
import { getSubjectsForStudent } from '@/lib/actions/student-type';
import { createClient } from '@/lib/supabase/server';
import { StudentDashboardClient } from './dashboard-client';

export default async function StudentDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [attendanceData, studyTimeData, weeklyGoals, currentSubject, weeklyProgress, typeSubjects] = await Promise.all([
    getTodayAttendance(),
    getTodayStudyTime(),
    getWeeklyGoals(),
    getCurrentSubject(),
    getWeeklyProgress(),
    user ? getSubjectsForStudent(user.id) : [],
  ]);

  return (
    <StudentDashboardClient
      userId={user?.id ?? ''}
      initialStatus={attendanceData.status}
      initialStudyTime={studyTimeData.totalSeconds}
      checkInTime={studyTimeData.checkInTime}
      weeklyGoals={weeklyGoals}
      currentSubject={currentSubject?.subject_name || null}
      weeklyProgress={weeklyProgress}
      availableSubjects={typeSubjects.length > 0 ? typeSubjects : null}
    />
  );
}
