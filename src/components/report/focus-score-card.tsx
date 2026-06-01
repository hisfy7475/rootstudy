'use client';

import { Brain } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { DailyReportData } from '@/lib/actions/report';

export interface FocusScoreCardProps {
  dailyData: DailyReportData[];
  weeklyFocusAvg: number | null;
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function FocusBarChart({ dailyData }: { dailyData: DailyReportData[] }) {
  const maxScore = 10;

  return (
    <div className='mt-2 flex h-16 items-end gap-2'>
      {dailyData.map((d, i) => {
        const heightPct = d.focusAvg !== null ? (d.focusAvg / maxScore) * 100 : 0;
        return (
          <div key={i} className='flex flex-1 flex-col items-center gap-1'>
            <div className='relative h-12 w-full overflow-hidden rounded-sm bg-gray-100'>
              <div
                className='bg-secondary/70 absolute bottom-0 w-full rounded-sm transition-all duration-300'
                style={{ height: `${heightPct}%` }}
              />
              <span className='text-text absolute inset-x-0 bottom-1 z-10 text-center text-xs leading-none font-semibold'>
                {d.focusAvg !== null ? d.focusAvg : ''}
              </span>
            </div>
            <span className='text-text-muted text-[10px]'>{DAY_LABELS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FocusScoreCard({ dailyData, weeklyFocusAvg }: FocusScoreCardProps) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <div className='flex items-center gap-2'>
          <div className='bg-secondary h-5 w-1.5 rounded-full' />
          <h3 className='text-text text-lg leading-none font-semibold tracking-tight'>몰입도</h3>
          {weeklyFocusAvg !== null && (
            <span className='text-secondary ml-auto flex items-center gap-1 text-sm font-bold'>
              <Brain className='h-4 w-4' />
              주간 평균 {weeklyFocusAvg}점
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {weeklyFocusAvg === null ? (
          <p className='text-text-muted py-4 text-center text-sm'>
            이번 주 몰입도 기록이 없습니다.
          </p>
        ) : (
          <FocusBarChart dailyData={dailyData} />
        )}
      </CardContent>
    </Card>
  );
}
