'use client';

import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

interface DayProgress {
  date: Date;
  achieved: boolean | null; // null이면 아직 데이터 없음
}

interface WeeklyProgressProps {
  days: DayProgress[];
  className?: string;
}

const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

export function WeeklyProgress({ days, className }: WeeklyProgressProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const achievedCount = days.filter(d => d.achieved === true).length;
  const totalDaysWithGoal = days.filter(d => d.achieved !== null).length;
  const achievementRate = totalDaysWithGoal > 0 
    ? Math.round((achievedCount / totalDaysWithGoal) * 100) 
    : 0;

  return (
    <div className={cn('bg-card rounded-3xl p-5 shadow-sm', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text">주간 목표 달성</h3>
        <span className="text-sm text-text-muted">
          {achievedCount}/{totalDaysWithGoal}일 달성
        </span>
      </div>

      {/* 주간 달력 */}
      <div className="flex justify-between gap-1">
        {days.map((day, index) => {
          const isToday = day.date.getTime() === today.getTime();
          const dayOfWeek = day.date.getDay();

          return (
            <div 
              key={index}
              className="flex flex-col items-center gap-2"
            >
              <span className={cn(
                'text-xs',
                isToday ? 'text-primary font-semibold' : 'text-text-muted'
              )}>
                {dayLabels[dayOfWeek]}
              </span>
              
              <div
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                  isToday && 'ring-2 ring-primary ring-offset-2',
                  day.achieved === true && 'bg-success/20',
                  day.achieved === false && 'bg-error/20',
                  day.achieved === null && 'bg-gray-100'
                )}
              >
                {day.achieved === true && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
                {day.achieved === false && (
                  <X className="w-4 h-4 text-red-500" />
                )}
                {day.achieved === null && (
                  <span className="text-xs text-text-muted">
                    {day.date.getDate()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 달성률 바 */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">달성률</span>
          <span className="text-xs font-semibold text-primary">{achievementRate}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
            style={{ width: `${achievementRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}
