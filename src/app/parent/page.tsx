import { getLinkedStudents, getParentDashboardData } from '@/lib/actions/parent';
import { getPendingAbsenceSchedulesForParent } from '@/lib/actions/absence-schedule';
import { ParentDashboardClient } from './dashboard-client';

export default async function ParentDashboard() {
  const [data, pendingSchedules, linked] = await Promise.all([
    getParentDashboardData(),
    getPendingAbsenceSchedulesForParent(),
    getLinkedStudents(),
  ]);

  return (
    <ParentDashboardClient
      students={data.students}
      pendingSchedules={pendingSchedules}
      withdrawnChildCount={linked.filter((s) => s.withdrawnAt).length}
    />
  );
}
