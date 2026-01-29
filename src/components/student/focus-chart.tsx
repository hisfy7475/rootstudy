'use client';

import { cn } from '@/lib/utils';

interface FocusData {
  date: string;
  dayLabel: string;
  avgScore: number | null;
}

interface FocusChartProps {
  data: FocusData[];
  className?: string;
}

export function FocusChart({ data, className }: FocusChartProps) {
  const maxScore = 10;

  return (
    <div className={cn('bg-card rounded-3xl p-5 shadow-sm', className)}>
      <h3 className="font-semibold text-text mb-4">주간 몰입도</h3>
      
      <div className="flex items-end justify-between gap-2 h-40">
        {data.map((day, index) => {
          const heightPercent = day.avgScore ? (day.avgScore / maxScore) * 100 : 0;
          const isToday = index === data.length - 1 - (6 - new Date().getDay());
          
          return (
            <div key={day.date} className="flex flex-col items-center gap-2 flex-1">
              {/* 바 */}
              <div className="relative w-full h-28 flex items-end justify-center">
                {day.avgScore !== null ? (
                  <div
                    className={cn(
                      'w-full max-w-8 rounded-t-lg transition-all duration-500',
                      isToday
                        ? 'bg-gradient-to-t from-primary to-accent'
                        : 'bg-primary/40'
                    )}
                    style={{ height: `${heightPercent}%` }}
                  >
                    {/* 점수 표시 */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                      <span className={cn(
                        'text-xs font-semibold',
                        isToday ? 'text-primary' : 'text-text-muted'
                      )}>
                        {day.avgScore.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full max-w-8 h-1 bg-gray-200 rounded-full" />
                )}
              </div>
              
              {/* 요일 */}
              <span className={cn(
                'text-xs',
                isToday ? 'text-primary font-semibold' : 'text-text-muted'
              )}>
                {day.dayLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-primary to-accent" />
          <span>오늘</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-primary/40" />
          <span>이번 주</span>
        </div>
      </div>
    </div>
  );
}
