'use client';

import { cn } from '@/lib/utils';
import { Target } from 'lucide-react';

interface DayProgress {
  date: Date;
  achieved: boolean | null;
}

interface WeeklyStudyProgressProps {
  goalHours: number;
  actualMinutes: number;
  progressPercent: number;
  studentTypeName: string | null;
  weekDays?: DayProgress[];
  className?: string;
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0) {
    return `${hours}시간 ${mins}분`;
  }
  return `${mins}분`;
}

const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

export function WeeklyStudyProgress({
  goalHours,
  actualMinutes,
  progressPercent,
  studentTypeName,
  weekDays = [],
  className,
}: WeeklyStudyProgressProps) {
  // 달성률에 따른 색상
  const getProgressColor = () => {
    if (progressPercent >= 100) return 'from-success to-accent';
    if (progressPercent >= 70) return 'from-primary to-accent';
    if (progressPercent >= 40) return 'from-warning to-primary';
    return 'from-error to-warning';
  };

  // 요일별 출석 통계
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const achievedCount = weekDays.filter(d => d.achieved === true).length;
  // 오늘까지의 날짜 수 (미래 제외)
  const totalPastDays = weekDays.filter(d => d.date <= today).length;

  return (
    <div className={cn('bg-card rounded-3xl p-5 shadow-sm', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-text">주간 학습 현황</h3>
        </div>
        {studentTypeName && (
          <span className="text-xs text-text-muted bg-gray-100 px-2 py-1 rounded-lg">
            {studentTypeName}
          </span>
        )}
      </div>

      {/* 목표 정보 */}
      {goalHours > 0 ? (
        <>
          {/* 프로그레스 바 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">달성률</span>
                <span className="text-xs text-text-muted">
                  {formatTime(actualMinutes)} / {goalHours}시간
                </span>
              </div>
              <span className={cn(
                'text-sm font-bold',
                progressPercent >= 100 ? 'text-success' : 'text-primary'
              )}>
                {progressPercent}%
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={cn(
                  'h-full bg-gradient-to-r rounded-full transition-all duration-500',
                  getProgressColor()
                )}
                style={{ width: `${Math.min(100, progressPercent)}%` }}
              />
            </div>
            {progressPercent >= 100 && (
              <p className="text-xs text-success mt-1.5">🎉 이번 주 목표 달성!</p>
            )}
          </div>

          {/* 요일별 달성 현황 */}
          {weekDays.length > 0 && (
            <>
              <div className="border-t border-gray-100 pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-text-muted">일별 출석</span>
                  <span className="text-xs text-text-muted">{achievedCount}/{totalPastDays}일</span>
                </div>
                <div className="flex justify-between gap-1">
                  {weekDays.map((day, index) => {
                    const isToday = day.date.getTime() === today.getTime();
                    const dayOfWeek = day.date.getDay();

                    return (
                      <div key={index} className="flex flex-col items-center gap-1.5">
                        <span className={cn(
                          'text-xs',
                          isToday ? 'text-primary font-semibold' : 'text-text-muted'
                        )}>
                          {dayLabels[dayOfWeek]}
                        </span>
                        <div
                          className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                            isToday && 'ring-2 ring-primary ring-offset-1',
                            day.achieved === true && 'bg-primary text-white',
                            day.achieved === false && 'bg-gray-100',
                            day.achieved === null && 'bg-gray-100'
                          )}
                        >
                          <span className={cn(
                            'text-xs font-medium',
                            day.achieved === true ? 'text-white' : 'text-text-muted'
                          )}>
                            {day.date.getDate()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-text-muted text-sm">
            학생 타입이 설정되지 않아 주간 목표가 없습니다.
          </p>
        </div>
      )}
    </div>
  );
}
