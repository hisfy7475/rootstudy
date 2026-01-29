import { getMyAbsenceSchedules } from '@/lib/actions/absence-schedule';
import ScheduleClient from './schedule-client';

export default async function StudentSchedulePage() {
  const schedules = await getMyAbsenceSchedules();

  return <ScheduleClient initialSchedules={schedules} />;
}
