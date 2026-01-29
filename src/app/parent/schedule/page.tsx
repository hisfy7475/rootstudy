import { getLinkedStudents } from '@/lib/actions/parent';
import { 
  getStudentAbsenceSchedules, 
  getPendingAbsenceSchedulesForParent 
} from '@/lib/actions/absence-schedule';
import { ScheduleClient } from './schedule-client';

export default async function SchedulePage() {
  const [linkedStudents, pendingSchedules] = await Promise.all([
    getLinkedStudents(),
    getPendingAbsenceSchedulesForParent(),
  ]);

  // 연결된 학생들의 모든 부재 스케줄 조회
  const absenceSchedulesPromises = linkedStudents.map(async student => {
    const schedules = await getStudentAbsenceSchedules(student.id);
    return schedules.map(s => ({
      ...s,
      studentName: student.name,
      studentId: student.id,
    }));
  });
  
  const absenceSchedulesArrays = await Promise.all(absenceSchedulesPromises);
  const absenceSchedules = absenceSchedulesArrays.flat();

  return (
    <ScheduleClient
      linkedStudents={linkedStudents}
      absenceSchedules={absenceSchedules}
      pendingSchedules={pendingSchedules}
    />
  );
}
