'use client';

import { cn } from '@/lib/utils';
import { Clock, Target } from 'lucide-react';

interface WeeklyStudyProgressProps {
  goalHours: number;
  actualMinutes: number;
  progressPercent: number;
  studentTypeName: string | null;
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

export function WeeklyStudyProgress({
  goalHours,
  actualMinutes,
  progressPercent,
  studentTypeName,
  className,
}: WeeklyStudyProgressProps) {
  // 달성률에 따른 색상
  const getProgressColor = () => {
    if (progressPercent >= 100) return 'from-success to-accent';
    if (progressPercent >= 70) return 'from-primary to-accent';
    if (progressPercent >= 40) return 'from-warning to-primary';
    return 'from-error to-warning';
  };

  const goalMinutes = goalHours * 60;
  const remainingMinutes = Math.max(0, goalMinutes - actualMinutes);

  return (
    <div className={cn('bg-card rounded-3xl p-5 shadow-sm', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-text">주간 학습 목표</h3>
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
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-text-muted mb-1">목표</p>
              <p className="font-bold text-text">{goalHours}시간</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-text-muted mb-1">현재</p>
              <p className="font-bold text-primary">{formatTime(actualMinutes)}</p>
            </div>
          </div>

          {/* 프로그레스 바 */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-muted">달성률</span>
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
          </div>

          {/* 남은 시간 */}
          {progressPercent < 100 && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Clock className="w-4 h-4" />
              <span>목표까지 {formatTime(remainingMinutes)} 남음</span>
            </div>
          )}

          {progressPercent >= 100 && (
            <div className="flex items-center gap-2 text-sm text-success">
              <span>🎉 이번 주 목표 달성!</span>
            </div>
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
