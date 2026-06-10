import {
  getAllStudents,
  getWeeklyFocusReport,
  getPenaltyPresets,
  getFocusScorePresets,
  getTodayFocusScoresByPeriod,
  getPhoneSubmissions,
} from '@/lib/actions/admin';
import { getFocusGridPeriods } from '@/lib/actions/period';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { getStudyDate, formatDate } from '@/lib/utils';
import { FocusClient } from './focus-client';

export default async function FocusManagementPage() {
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

  const [
    students,
    report,
    todayPeriodsData,
    penaltyPresets,
    focusPresets,
    focusScoresByPeriod,
    phoneSubmissions,
  ] = await Promise.all([
    getAllStudents('all', branchId),
    getWeeklyFocusReport(branchId),
    getFocusGridPeriods(branchId),
    getPenaltyPresets(branchId),
    getFocusScorePresets(branchId),
    getTodayFocusScoresByPeriod(branchId),
    getPhoneSubmissions(today, branchId),
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
      initialPhoneSubmissions={phoneSubmissions}
    />
  );
}
