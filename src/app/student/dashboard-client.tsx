'use client';

import { useState, useTransition } from 'react';
import { TimerDisplay } from '@/components/student/timer-display';
import { StatusBadge, type AttendanceStatus } from '@/components/student/status-badge';
import { WeeklyProgress } from '@/components/student/weekly-progress';
import { WeeklyStudyProgress } from '@/components/student/weekly-study-progress';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BookOpen, LogIn, LogOut, Coffee, Undo2 } from 'lucide-react';
import { checkIn, checkOut, startBreak, endBreak } from '@/lib/actions/student';

interface WeeklyProgressData {
  goalHours: number;
  actualMinutes: number;
  progressPercent: number;
  studentTypeName: string | null;
}

interface DashboardProps {
  initialStatus: AttendanceStatus;
  initialStudyTime: number;
  checkInTime: string | null;
  weeklyGoals: Array<{ date: string; achieved: boolean | null }>;
  currentSubject: string | null;
  weeklyProgress: WeeklyProgressData;
}

export function StudentDashboardClient({
  initialStatus,
  initialStudyTime,
  checkInTime,
  weeklyGoals,
  currentSubject,
  weeklyProgress,
}: DashboardProps) {
  const [status, setStatus] = useState<AttendanceStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();

  // 주간 목표 데이터 변환
  const weekDays = weeklyGoals.map(g => ({
    date: new Date(g.date),
    achieved: g.achieved,
  }));

  // 타이머 시작 시간 계산
  const startTime = checkInTime ? new Date(checkInTime) : null;
  const isTimerActive = status === 'checked_in';

  const handleCheckIn = () => {
    startTransition(async () => {
      const result = await checkIn();
      if (result.success) {
        setStatus('checked_in');
      }
    });
  };

  const handleCheckOut = () => {
    startTransition(async () => {
      const result = await checkOut();
      if (result.success) {
        setStatus('checked_out');
      }
    });
  };

  const handleStartBreak = () => {
    startTransition(async () => {
      const result = await startBreak();
      if (result.success) {
        setStatus('on_break');
      }
    });
  };

  const handleEndBreak = () => {
    startTransition(async () => {
      const result = await endBreak();
      if (result.success) {
        setStatus('checked_in');
      }
    });
  };

  return (
    <div className="p-4 space-y-6">
      {/* 상태 배지 */}
      <div className="flex justify-center">
        <StatusBadge status={status} />
      </div>

      {/* 타이머 */}
      <TimerDisplay
        startTime={startTime}
        isActive={isTimerActive}
        className="my-8"
      />

      {/* 입실/퇴실 버튼 */}
      <div className="flex justify-center gap-3">
        {status === 'checked_out' && (
          <Button
            onClick={handleCheckIn}
            disabled={isPending}
            className="px-8 py-6 text-lg gap-2"
          >
            <LogIn className="w-5 h-5" />
            입실하기
          </Button>
        )}

        {status === 'checked_in' && (
          <>
            <Button
              onClick={handleStartBreak}
              disabled={isPending}
              variant="outline"
              className="px-6 py-6 gap-2"
            >
              <Coffee className="w-5 h-5" />
              외출
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={isPending}
              variant="secondary"
              className="px-6 py-6 gap-2"
            >
              <LogOut className="w-5 h-5" />
              퇴실
            </Button>
          </>
        )}

        {status === 'on_break' && (
          <Button
            onClick={handleEndBreak}
            disabled={isPending}
            className="px-8 py-6 text-lg gap-2"
          >
            <Undo2 className="w-5 h-5" />
            복귀하기
          </Button>
        )}
      </div>

      {/* 현재 학습 과목 */}
      {currentSubject && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-text-muted">현재 학습 중</p>
              <p className="font-semibold text-text">{currentSubject}</p>
            </div>
          </div>
        </Card>
      )}

      {/* 주간 학습 목표 달성도 */}
      <WeeklyStudyProgress
        goalHours={weeklyProgress.goalHours}
        actualMinutes={weeklyProgress.actualMinutes}
        progressPercent={weeklyProgress.progressPercent}
        studentTypeName={weeklyProgress.studentTypeName}
      />

      {/* 주간 등원 목표 달성 현황 */}
      <WeeklyProgress days={weekDays} />
    </div>
  );
}
