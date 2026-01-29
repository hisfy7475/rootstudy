import { getParentDashboardData } from '@/lib/actions/parent';
import { getPendingAbsenceSchedulesForParent } from '@/lib/actions/absence-schedule';
import { ParentDashboardClient } from './dashboard-client';

export default async function ParentDashboard() {
  const [data, pendingSchedules] = await Promise.all([
    getParentDashboardData(),
    getPendingAbsenceSchedulesForParent(),
  ]);

  return (
    <ParentDashboardClient
      students={data.students}
      pendingSchedules={pendingSchedules}
    />
  );
}
