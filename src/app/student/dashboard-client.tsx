'use client';

import { useState, useTransition } from 'react';
import { TimerDisplay } from '@/components/student/timer-display';
import { ExamTimer } from '@/components/student/exam-timer';
import { SwipeableTimer } from '@/components/student/swipeable-timer';
import { StatusBadge, type AttendanceStatus } from '@/components/student/status-badge';
import { WeeklyStudyProgress } from '@/components/student/weekly-study-progress';
import { subjects as subjectMeta } from '@/components/student/subject-selector';
import { changeSubject } from '@/lib/actions/student';
import { cn } from '@/lib/utils';

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
  availableSubjects: string[] | null;
}

const defaultSubjects = ['국어', '수학', '영어', '과학', '사회', '기타'];

export function StudentDashboardClient({
  initialStatus,
  initialStudyTime,
  checkInTime,
  weeklyGoals,
  currentSubject,
  weeklyProgress,
  availableSubjects,
}: DashboardProps) {
  const status: AttendanceStatus = initialStatus;
  const [selectedSubject, setSelectedSubject] = useState<string | null>(currentSubject);
  const [isPending, startTransition] = useTransition();

  // 주간 목표 데이터 변환
  const weekDays = weeklyGoals.map(g => ({
    date: new Date(g.date),
    achieved: g.achieved,
  }));

  // 타이머 시작 시간 계산
  const startTime = checkInTime ? new Date(checkInTime) : null;
  const isTimerActive = status === 'checked_in';

  // 사용 가능한 과목 목록
  const subjectNames = availableSubjects || defaultSubjects;

  const handleSubjectSelect = (subject: string) => {
    if (subject === selectedSubject || isPending || status !== 'checked_in') return;
    setSelectedSubject(subject);
    startTransition(async () => {
      await changeSubject(subject);
    });
  };

  // 과목 메타 정보 매칭 (아이콘, 색상)
  const getSubjectMeta = (name: string) => {
    return subjectMeta.find(s => s.name === name);
  };

  return (
    <div className="p-4 space-y-5">
      {/* 상태 배지 */}
      <StatusBadge status={status} />

      {/* 과목 선택 - 전과목 칩 리스트 */}
      <div className="flex flex-wrap gap-2">
        {subjectNames.map((name) => {
          const meta = getSubjectMeta(name);
          const Icon = meta?.icon;
          const isSelected = selectedSubject === name;
          const isDisabled = isPending || status !== 'checked_in';

          return (
            <button
              key={name}
              onClick={() => handleSubjectSelect(name)}
              disabled={isDisabled}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all',
                isSelected
                  ? 'bg-primary text-white font-bold shadow-md scale-105'
                  : 'bg-gray-100 text-text-muted font-normal hover:bg-gray-200',
                isDisabled && !isSelected && 'opacity-50 cursor-not-allowed'
              )}
            >
              {Icon && (
                <Icon className={cn(
                  'w-3.5 h-3.5',
                  isSelected ? 'text-white' : 'text-text-muted'
                )} />
              )}
              {name}
            </button>
          );
        })}
      </div>

      {/* 스와이프 타이머 영역 (순공시간 / 모의고사 타이머) */}
      <SwipeableTimer labels={['순공시간', '타이머']}>
        <TimerDisplay
          startTime={startTime}
          isActive={isTimerActive}
          className="py-4"
        />
        <ExamTimer className="py-4" />
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
