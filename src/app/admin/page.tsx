import { getAllStudents } from '@/lib/actions/admin';
import { DashboardClient } from './dashboard-client';

export default async function AdminDashboard() {
  const students = await getAllStudents();

  return <DashboardClient initialStudents={students} />;
}
