import { getSchedules, getLinkedStudents } from '@/lib/actions/parent';
import { getStudentAbsenceSchedules } from '@/lib/actions/absence-schedule';
import { ScheduleClient } from './schedule-client';

export default async function SchedulePage() {
  const [pendingSchedules, approvedSchedules, rejectedSchedules, linkedStudents] = await Promise.all([
    getSchedules('pending'),
    getSchedules('approved'),
    getSchedules('rejected'),
    getLinkedStudents(),
  ]);

  // 연결된 학생들의 부재 스케줄 조회
  const absenceSchedulesPromises = linkedStudents.map(async student => {
    const schedules = await getStudentAbsenceSchedules(student.id);
    return schedules.map(s => ({
      ...s,
      studentName: student.name,
    }));
  });
  
  const absenceSchedulesArrays = await Promise.all(absenceSchedulesPromises);
  const absenceSchedules = absenceSchedulesArrays.flat();

  return (
    <ScheduleClient
      pendingSchedules={pendingSchedules}
      approvedSchedules={approvedSchedules}
      rejectedSchedules={rejectedSchedules}
      absenceSchedules={absenceSchedules}
    />
  );
}
