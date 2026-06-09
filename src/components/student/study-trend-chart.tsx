'use client';

import { cn, getStudyDate, getWeekStart } from '@/lib/utils';

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

interface BarInfo {
  key: string;
  label: string;
  totalSeconds: number;
  isCurrent: boolean;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// 'YYYY-MM-DD' 학습일 문자열을 브라우저 타임존과 무관하게 KST 기준으로 처리
function studyDateStr(date: Date): string {
  return getStudyDate(date).toISOString().split('T')[0];
}

export function StudyTrendChart({ data, period, className }: StudyTrendChartProps) {
  // 최대값 계산 (최소 1시간으로 설정하여 스케일 유지)
  const maxSeconds = Math.max(
    3600, // 최소 1시간
    ...data.map((d) => d.totalSeconds),
  );

  // 강조 기준: 주간=오늘 학습일, 월간=이번 주 월요일 학습일
  const todayStudy = studyDateStr(new Date());
  const currentWeekMonday = studyDateStr(getWeekStart(new Date()));

  // 막대 표시 모델 통일 (weekly: 일별 / monthly: 주별)
  const bars: BarInfo[] = data.map((item, index) => {
    const [y, mo, d] = item.date.split('-').map(Number);
    const isCurrent =
      period === 'weekly' ? item.date === todayStudy : item.date === currentWeekMonday;
    const label =
      period === 'weekly'
        ? WEEKDAY_LABELS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
        : `${index + 1}주`;

    return { key: item.date, label, totalSeconds: item.totalSeconds, isCurrent };
  });

  const highlightLabel = period === 'weekly' ? '오늘' : '이번 주';

  return (
    <div className={cn('space-y-2', className)}>
      {/* 차트 영역 (값 + 막대 + X축) */}
      <div>
        <div className='flex gap-1'>
          {bars.map((bar) => {
            const height = maxSeconds > 0 ? (bar.totalSeconds / maxSeconds) * 100 : 0;

            return (
              <div key={bar.key} className='flex flex-1 flex-col items-center'>
                {/* 값 레이블 (막대 위 텍스트) */}
                <div className='mb-1.5 flex h-4 items-end justify-center'>
                  {bar.totalSeconds > 0 && (
                    <span className='text-text-muted text-[10px] font-medium whitespace-nowrap'>
                      {formatDuration(bar.totalSeconds)}
                    </span>
                  )}
                </div>

                {/* 막대 (고정 높이 기준으로 비율 계산) */}
                <div className='flex h-32 w-full flex-col items-center justify-end'>
                  {bar.totalSeconds > 0 ? (
                    <div
                      className={cn(
                        'w-full max-w-8 rounded-t-md transition-all duration-500',
                        bar.isCurrent
                          ? 'from-primary to-accent bg-gradient-to-t'
                          : 'from-primary/60 to-primary/40 bg-gradient-to-t',
                      )}
                      style={{ height: `${Math.max(4, height)}%` }}
                    />
                  ) : (
                    <div className='h-1 w-full max-w-8 rounded-full bg-gray-200' />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* X축 레이블 */}
        <div className='mt-2 flex gap-1'>
          {bars.map((bar) => (
            <div
              key={bar.key}
              className={cn(
                'flex-1 text-center text-xs',
                bar.isCurrent ? 'text-primary font-semibold' : 'text-text-muted',
              )}
            >
              {bar.label}
            </div>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div className='mt-2 flex items-center justify-center gap-4 border-t border-gray-100 pt-2'>
        <div className='flex items-center gap-1.5'>
          <div className='from-primary to-accent h-3 w-3 rounded bg-gradient-to-r' />
          <span className='text-text-muted text-xs'>{highlightLabel}</span>
        </div>
        <div className='flex items-center gap-1.5'>
          <div className='bg-primary/50 h-3 w-3 rounded' />
          <span className='text-text-muted text-xs'>기타</span>
        </div>
      </div>
    </div>
  );
}
