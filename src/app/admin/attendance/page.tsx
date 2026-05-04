import { getAttendanceBoard } from '@/lib/actions/admin';
import { getTodayPeriods } from '@/lib/actions/period';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { getStudyDate, formatDate } from '@/lib/utils';
import { AttendanceClient } from './attendance-client';

export default async function AttendancePage() {
  const ctx = await requireAdminBranch();
  if (!ctx) {
    return (
      <div className='p-6'>
        <h1 className='text-xl font-bold'>접근 권한이 없습니다.</h1>
      </div>
    );
  }
  const { branchId } = ctx;
  const today = formatDate(getStudyDate());

  const [attendanceData, todayPeriodsData] = await Promise.all([
    getAttendanceBoard(undefined, branchId),
    getTodayPeriods(branchId),
  ]);

  return (
    <AttendanceClient
      initialData={attendanceData}
      todayPeriods={todayPeriodsData.periods}
      dateTypeName={todayPeriodsData.dateTypeName}
      todayDate={today}
      branchId={branchId}
    />
  );
}
