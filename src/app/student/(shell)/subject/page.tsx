import { getCurrentSubject, getTodayAttendance, getTodaySubjects } from '@/lib/actions/student';
import { getSubjectsForStudent } from '@/lib/actions/student-type';
import { createClient } from '@/lib/supabase/server';
import { SubjectPageClient } from './subject-client';

export default async function SubjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [currentSubject, todaySubjects, typeSubjects, attendance] = await Promise.all([
    getCurrentSubject(),
    getTodaySubjects(),
    user ? getSubjectsForStudent(user.id) : [],
    getTodayAttendance(),
  ]);

  const isCheckedIn = attendance.status === 'checked_in';

  return (
    <SubjectPageClient
      currentSubject={currentSubject?.subject_name || null}
      subjectHistory={todaySubjects.map((s) => ({
        id: s.id,
        name: s.subject_name,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        isCurrent: s.is_current,
      }))}
      availableSubjects={typeSubjects.length > 0 ? typeSubjects : null}
      isCheckedIn={isCheckedIn}
    />
  );
}
