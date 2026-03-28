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
  const maxScore = 100;

  return (
    <div className="mt-2 flex h-16 items-end gap-2">
      {dailyData.map((d, i) => {
        const heightPct = d.focusAvg !== null ? (d.focusAvg / maxScore) * 100 : 0;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-medium leading-none text-text-muted">
              {d.focusAvg !== null ? d.focusAvg : ''}
            </span>
            <div className="h-10 w-full overflow-hidden rounded-sm bg-gray-100">
              <div
                className="w-full rounded-sm bg-secondary/70 transition-all duration-300"
                style={{
                  height: `${heightPct}%`,
                  marginTop: `${100 - heightPct}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-text-muted">{DAY_LABELS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FocusScoreCard({ dailyData, weeklyFocusAvg }: FocusScoreCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-1.5 rounded-full bg-secondary" />
          <h3 className="text-lg font-semibold leading-none tracking-tight text-text">
            몰입도
          </h3>
          {weeklyFocusAvg !== null && (
            <span className="ml-auto flex items-center gap-1 text-sm font-bold text-secondary">
              <Brain className="h-4 w-4" />
              주간 평균 {weeklyFocusAvg}점
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {weeklyFocusAvg === null ? (
          <p className="py-4 text-center text-sm text-text-muted">
            이번 주 몰입도 기록이 없습니다.
          </p>
        ) : (
          <FocusBarChart dailyData={dailyData} />
        )}
      </CardContent>
    </Card>
  );
}
