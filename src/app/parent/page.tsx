import { getParentDashboardData } from '@/lib/actions/parent';
import { ParentDashboardClient } from './dashboard-client';

export default async function ParentDashboard() {
  const data = await getParentDashboardData();

  return (
    <ParentDashboardClient
      students={data.students}
      totalPendingSchedules={data.totalPendingSchedules}
    />
  );
}
