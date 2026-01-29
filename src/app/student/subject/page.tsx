import { getCurrentSubject, getTodaySubjects } from '@/lib/actions/student';
import { getSubjectsForStudent } from '@/lib/actions/student-type';
import { createClient } from '@/lib/supabase/server';
import { SubjectPageClient } from './subject-client';

export default async function SubjectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const [currentSubject, todaySubjects, typeSubjects] = await Promise.all([
    getCurrentSubject(),
    getTodaySubjects(),
    user ? getSubjectsForStudent(user.id) : [],
  ]);

  // 과목별 학습시간 계산
  const subjectTimes: Record<string, number> = {};
  todaySubjects.forEach((subject, index) => {
    const startTime = new Date(subject.started_at).getTime();
    const endTime = subject.ended_at 
      ? new Date(subject.ended_at).getTime()
      : subject.is_current 
        ? Date.now()
        : startTime;
    
    const duration = Math.floor((endTime - startTime) / 1000);
    subjectTimes[subject.subject_name] = (subjectTimes[subject.subject_name] || 0) + duration;
  });

  return (
    <SubjectPageClient
      currentSubject={currentSubject?.subject_name || null}
      subjectHistory={todaySubjects.map(s => ({
        id: s.id,
        name: s.subject_name,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        isCurrent: s.is_current,
      }))}
      subjectTimes={subjectTimes}
      availableSubjects={typeSubjects.length > 0 ? typeSubjects : null}
    />
  );
}
