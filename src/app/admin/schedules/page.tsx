import { 
  getAllAbsenceSchedules, 
  getPendingAbsenceSchedulesForAdmin 
} from '@/lib/actions/absence-schedule';
import { getAllStudents } from '@/lib/actions/admin';
import SchedulesClient from './schedules-client';

export default async function AdminSchedulesPage() {
  const [schedules, pendingSchedules, students] = await Promise.all([
    getAllAbsenceSchedules(),
    getPendingAbsenceSchedulesForAdmin(),
    getAllStudents(),
  ]);

  // 학생 목록 간소화
  const studentList = students.map(s => ({
    id: s.id,
    name: s.name,
    seatNumber: s.seatNumber,
  }));

  return (
    <SchedulesClient 
      initialSchedules={schedules} 
      pendingSchedules={pendingSchedules}
      students={studentList} 
    />
  );
}
