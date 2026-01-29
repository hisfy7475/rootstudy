'use client';

import { cn } from '@/lib/utils';
import { Check, X, Clock } from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { ko } from 'date-fns/locale';

interface GoalDay {
  date: string;
  targetTime: string | null;
  achieved: boolean | null;
}

interface GoalCalendarProps {
  goals: GoalDay[];
  className?: string;
}

export function GoalCalendar({ goals, className }: GoalCalendarProps) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });

  // 주간 데이터 생성
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const goal = goals.find(g => g.date === dateStr);
    
    return {
      date,
      dateStr,
      targetTime: goal?.targetTime || null,
      achieved: goal?.achieved ?? null,
    };
  });

  return (
    <div className={cn('bg-card rounded-3xl p-5 shadow-sm', className)}>
      <h3 className="font-semibold text-text mb-4">이번 주 등원 목표</h3>
      
      <div className="space-y-2">
        {weekDays.map((day) => {
          const isTodayDate = isToday(day.date);
          
          return (
            <div
              key={day.dateStr}
              className={cn(
                'flex items-center justify-between p-3 rounded-2xl transition-all',
                isTodayDate ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-gray-50'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex flex-col items-center justify-center',
                  isTodayDate ? 'bg-primary text-white' : 'bg-white'
                )}>
                  <span className="text-xs opacity-70">
                    {format(day.date, 'EEE', { locale: ko })}
                  </span>
                  <span className="text-sm font-semibold">
                    {format(day.date, 'd')}
                  </span>
                </div>
                
                <div>
                  {day.targetTime ? (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-text-muted" />
                      <span className="text-sm font-medium text-text">
                        {day.targetTime.slice(0, 5)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-text-muted">목표 없음</span>
                  )}
                </div>
              </div>

              {/* 달성 여부 */}
              <div>
                {day.achieved === true && (
                  <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                )}
                {day.achieved === false && (
                  <div className="w-8 h-8 rounded-full bg-error/20 flex items-center justify-center">
                    <X className="w-4 h-4 text-red-500" />
                  </div>
                )}
                {day.achieved === null && day.targetTime && (
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xs text-text-muted">-</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
