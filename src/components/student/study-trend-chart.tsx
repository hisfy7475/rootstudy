'use client';

import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface TrendData {
  date: string;
  totalSeconds: number;
  subjectTimes: Record<string, number>;
}

interface StudyTrendChartProps {
  data: TrendData[];
  period: 'weekly' | 'monthly';
  className?: string;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function StudyTrendChart({ data, period, className }: StudyTrendChartProps) {
  // 최대값 계산 (최소 1시간으로 설정하여 스케일 유지)
  const maxSeconds = Math.max(
    3600, // 최소 1시간
    ...data.map(d => d.totalSeconds)
  );

  // 오늘 날짜
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className={cn('space-y-2', className)}>
      {/* Y축 레이블 */}
      <div className="flex justify-between text-xs text-text-muted mb-2">
        <span>{formatDuration(maxSeconds)}</span>
        <span>0</span>
      </div>

      {/* 차트 영역 */}
      <div className="flex items-end gap-1 h-32">
        {data.map((item, index) => {
          const height = maxSeconds > 0 
            ? (item.totalSeconds / maxSeconds) * 100 
            : 0;
          const isToday = item.date === todayStr;
          const date = new Date(item.date);

          return (
            <div
              key={item.date}
              className="flex-1 flex flex-col items-center gap-1"
            >
              {/* 바 */}
              <div className="w-full flex flex-col items-center justify-end h-full">
                {item.totalSeconds > 0 ? (
                  <div
                    className={cn(
                      'w-full max-w-8 rounded-t-md transition-all duration-500',
                      isToday
                        ? 'bg-gradient-to-t from-primary to-accent'
                        : 'bg-gradient-to-t from-primary/60 to-primary/40'
                    )}
                    style={{ height: `${Math.max(4, height)}%` }}
                    title={`${format(date, 'M/d', { locale: ko })}: ${formatDuration(item.totalSeconds)}`}
                  />
                ) : (
                  <div
                    className="w-full max-w-8 h-1 bg-gray-200 rounded-full"
                    title={`${format(date, 'M/d', { locale: ko })}: 기록 없음`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* X축 레이블 */}
      <div className="flex gap-1">
        {data.map((item) => {
          const date = new Date(item.date);
          const isToday = item.date === todayStr;
          
          // 주간: 요일 표시, 월간: 날짜 표시
          const label = period === 'weekly' 
            ? format(date, 'E', { locale: ko })
            : format(date, 'd', { locale: ko });

          return (
            <div
              key={item.date}
              className={cn(
                'flex-1 text-center text-xs',
                isToday ? 'text-primary font-semibold' : 'text-text-muted'
              )}
            >
              {label}
            </div>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="flex items-center justify-center gap-4 pt-2 border-t border-gray-100 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gradient-to-r from-primary to-accent" />
          <span className="text-xs text-text-muted">오늘</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-primary/50" />
          <span className="text-xs text-text-muted">기타</span>
        </div>
      </div>
    </div>
  );
}
