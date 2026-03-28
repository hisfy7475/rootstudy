'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  REPORT_SUBJECT_COLORS,
  SUBJECT_CATEGORY_ORDER,
} from '@/lib/constants';
import type { DailySubjectData } from '@/lib/actions/report';

export interface SubjectBandChartProps {
  data: DailySubjectData[];
}

export function SubjectBandChart({ data }: SubjectBandChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-1.5 rounded-full bg-primary" />
          <h3 className="text-lg font-semibold leading-none tracking-tight text-text">
            과목별 학습현황
          </h3>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {data.map((row, idx) => {
            const total = SUBJECT_CATEGORY_ORDER.reduce(
              (sum, key) => sum + (row.categories[key] ?? 0),
              0
            );
            const hasData = total > 0;

            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-center text-xs font-medium text-text-muted">
                  {row.dayLabel}
                </span>
                <div className="flex h-4 min-w-0 flex-1 overflow-hidden rounded-md bg-gray-100">
                  {hasData ? (
                    SUBJECT_CATEGORY_ORDER.map((cat) => {
                      const sec = row.categories[cat] ?? 0;
                      if (sec <= 0) return null;
                      const pct = (sec / total) * 100;
                      return (
                        <div
                          key={cat}
                          className="h-full min-w-0"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: REPORT_SUBJECT_COLORS[cat] ?? '#D1D5DB',
                          }}
                          title={`${cat} ${Math.round(sec / 60)}분`}
                        />
                      );
                    })
                  ) : (
                    <div className="h-full w-full bg-gray-200" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-gray-100 pt-4">
          {SUBJECT_CATEGORY_ORDER.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: REPORT_SUBJECT_COLORS[cat] }}
              />
              <span className="text-xs text-text-muted">{cat}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
