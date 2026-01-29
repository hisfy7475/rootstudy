import { getTodayAttendance, getTodayStudyTime, getWeeklyGoals, getCurrentSubject, getWeeklyProgress } from '@/lib/actions/student';
import { StudentDashboardClient } from './dashboard-client';

export default async function StudentDashboard() {
  const [attendanceData, studyTimeData, weeklyGoals, currentSubject, weeklyProgress] = await Promise.all([
    getTodayAttendance(),
    getTodayStudyTime(),
    getWeeklyGoals(),
    getCurrentSubject(),
    getWeeklyProgress(),
  ]);

  return (
    <StudentDashboardClient
      initialStatus={attendanceData.status}
      initialStudyTime={studyTimeData.totalSeconds}
      checkInTime={studyTimeData.checkInTime}
      weeklyGoals={weeklyGoals}
      currentSubject={currentSubject?.subject_name || null}
      weeklyProgress={weeklyProgress}
    />
  );
}
