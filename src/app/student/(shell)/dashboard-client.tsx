'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import { TimerDisplay } from '@/components/student/timer-display';
import { ExamTimer } from '@/components/student/exam-timer';
import { SwipeableTimer } from '@/components/student/swipeable-timer';
import { StatusBadge, type AttendanceStatus } from '@/components/student/status-badge';
import { WeeklyStudyProgress } from '@/components/student/weekly-study-progress';
import { SubjectSelector } from '@/components/student/subject-selector';
import { Card } from '@/components/ui/card';
import {
  changeSubject,
  getTodayAttendance,
  getTodayStudyTime,
  resetCurrentSubject,
  restoreSubject,
} from '@/lib/actions/student';
import { createClient } from '@/lib/supabase/client';
import { BookOpen } from 'lucide-react';

interface WeeklyProgressData {
  goalHours: number;
  actualMinutes: number;
  progressPercent: number;
  studentTypeName: string | null;
}

interface DashboardProps {
  userId: string;
  initialStatus: AttendanceStatus;
  initialStudyTime: number;
  checkInTime: string | null;
  weeklyGoals: Array<{ date: string; achieved: boolean | null }>;
  currentSubject: string | null;
  weeklyProgress: WeeklyProgressData;
  availableSubjects: string[] | null;
}

export function StudentDashboardClient({
  userId,
  initialStatus,
  initialStudyTime,
  checkInTime: initialCheckInTime,
  weeklyGoals,
  currentSubject,
  weeklyProgress,
  availableSubjects,
}: DashboardProps) {
  const [status, setStatus] = useState<AttendanceStatus>(initialStatus);
  const [studyTime, setStudyTime] = useState(initialStudyTime);
  const [checkInTime, setCheckInTime] = useState(initialCheckInTime);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(currentSubject);
  const [isPending, startTransition] = useTransition();

  const refreshAttendance = useCallback(async () => {
    try {
      const [attendanceData, studyTimeData] = await Promise.all([
        getTodayAttendance(),
        getTodayStudyTime(),
      ]);
      setStatus(attendanceData.status);
      setStudyTime(studyTimeData.totalSeconds);
      setCheckInTime(studyTimeData.checkInTime);
    } catch (error) {
      console.error('Failed to refresh attendance:', error);
    }
  }, []);

  // 본인 attendance 변경 시 실시간 갱신
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('student-attendance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: `student_id=eq.${userId}`,
        },
        () => {
          refreshAttendance();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshAttendance]);

  // 주간 목표 데이터 변환
  const weekDays = weeklyGoals.map((g) => ({
    date: new Date(g.date),
    achieved: g.achieved,
  }));

  const startTime = checkInTime ? new Date(checkInTime) : null;
  const isTimerActive = status === 'checked_in';

  const handleSubjectSelect = (subject: string) => {
    if (subject === selectedSubject || isPending || status !== 'checked_in') return;
    setSelectedSubject(subject);
    startTransition(async () => {
      await changeSubject(subject);
    });
  };

  const handleSubjectReset = () => {
    const prev = selectedSubject;
    if (!prev) return;
    setSelectedSubject(null);

    startTransition(async () => {
      const res = await resetCurrentSubject();
      if (res.error || !res.success) {
        setSelectedSubject(prev);
        toast.error(res.error ?? '과목 해제에 실패했습니다');
        return;
      }

      const { subjectName, startedAt } = res.success;
      toast.success(`${subjectName} 선택이 해제되었습니다`, {
        duration: 5000,
        action: {
          label: '실행 취소',
          onClick: () => {
            startTransition(async () => {
              const restore = await restoreSubject(subjectName, startedAt);
              if (restore.error) {
                toast.error(restore.error);
              } else {
                setSelectedSubject(subjectName);
                toast.success(`${subjectName} 선택이 복원되었습니다`);
              }
            });
          },
        },
      });
    });
  };

  return (
    <div className='space-y-5 p-4'>
      {/* 상태 배지 */}
      <StatusBadge status={status} />

      {/* 과목 선택 */}
      <Card className='border-primary/20 border p-4'>
        <div className='mb-3 flex items-center gap-2.5'>
          <div className='bg-primary/10 flex h-8 w-8 items-center justify-center rounded-xl'>
            <BookOpen className='text-primary h-4 w-4' />
          </div>
          <div>
            <h2 className='text-text text-sm font-bold'>지금 공부할 과목</h2>
            {status === 'checked_in' && !selectedSubject && (
              <p className='text-primary text-xs'>과목을 선택해 주세요</p>
            )}
          </div>
        </div>
        <SubjectSelector
          selected={selectedSubject}
          onSelect={handleSubjectSelect}
          onReset={handleSubjectReset}
          disabled={isPending || status !== 'checked_in'}
          availableSubjects={availableSubjects}
          variant='prominent'
        />
      </Card>

      {/* 스와이프 타이머 영역 (순공시간 / 모의고사 타이머) */}
      <SwipeableTimer labels={['순공시간', '타이머']}>
        <TimerDisplay
          startTime={startTime}
          isActive={isTimerActive}
          initialSeconds={studyTime}
          className='py-4'
        />
        <ExamTimer className='py-4' />
      </SwipeableTimer>

      {/* 주간 학습 현황 (목표 + 요일별 달성) */}
      <WeeklyStudyProgress
        goalHours={weeklyProgress.goalHours}
        actualMinutes={weeklyProgress.actualMinutes}
        progressPercent={weeklyProgress.progressPercent}
        studentTypeName={weeklyProgress.studentTypeName}
        weekDays={weekDays}
      />
    </div>
  );
}
