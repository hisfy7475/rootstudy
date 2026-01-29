import { getAllStudents, getWeeklyFocusReport } from '@/lib/actions/admin';
import { FocusClient } from './focus-client';

export default async function FocusManagementPage() {
  const [students, report] = await Promise.all([
    getAllStudents('checked_in'),
    getWeeklyFocusReport(),
  ]);

  return <FocusClient initialStudents={students} initialReport={report} />;
}
