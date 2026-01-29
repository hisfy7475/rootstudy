import { getAllAbsenceSchedules } from '@/lib/actions/absence-schedule';
import SchedulesClient from './schedules-client';

export default async function AdminSchedulesPage() {
  const schedules = await getAllAbsenceSchedules();

  return <SchedulesClient initialSchedules={schedules} />;
}
