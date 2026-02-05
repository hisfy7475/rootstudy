'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { TimerDisplay } from '@/components/student/timer-display';
import { StatusBadge, type AttendanceStatus } from '@/components/student/status-badge';
import { WeeklyStudyProgress } from '@/components/student/weekly-study-progress';
import { BookOpen, ChevronDown, Check } from 'lucide-react';
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 주간 목표 데이터 변환
  const weekDays = weeklyGoals.map(g => ({
    date: new Date(g.date),
    achieved: g.achieved,
  }));

  // 타이머 시작 시간 계산
  const startTime = checkInTime ? new Date(checkInTime) : null;
  const isTimerActive = status === 'checked_in';

  // 사용 가능한 과목 목록
  const subjects = availableSubjects || defaultSubjects;

  const handleSubjectSelect = (subject: string) => {
    if (subject === selectedSubject) {
      setIsDropdownOpen(false);
      return;
    }
    setSelectedSubject(subject);
    setIsDropdownOpen(false);
    startTransition(async () => {
      await changeSubject(subject);
    });
  };

  return (
    <div className="p-4 space-y-6">
      {/* 상태 배지 + 과목 선택 */}
      <div className="flex items-center justify-between">
        <StatusBadge status={status} />
        
        {/* 과목 선택 드롭다운 */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={isPending || status !== 'checked_in'}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full transition-all',
              'bg-primary/10 hover:bg-primary/20',
              (isPending || status !== 'checked_in') && 'opacity-50 cursor-not-allowed'
            )}
          >
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              {selectedSubject || '과목 선택'}
            </span>
            <ChevronDown className={cn(
              'w-4 h-4 text-primary transition-transform',
              isDropdownOpen && 'rotate-180'
            )} />
          </button>

          {/* 드롭다운 메뉴 */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-40 bg-card rounded-xl shadow-lg border border-gray-100 py-2 z-50">
              {subjects.map((subject) => (
                <button
                  key={subject}
                  onClick={() => handleSubjectSelect(subject)}
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm flex items-center justify-between',
                    'hover:bg-gray-50 transition-colors',
                    selectedSubject === subject && 'text-primary font-medium'
                  )}
                >
                  {subject}
                  {selectedSubject === subject && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 타이머 */}
      <TimerDisplay
        startTime={startTime}
        isActive={isTimerActive}
        className="my-8"
      />

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
