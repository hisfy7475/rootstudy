'use client';

import { useCallback, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, UserX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  cn,
  formatDateKST,
  getWeekDateStringsFromMondayKST,
} from '@/lib/utils';
import {
  getImmersionReportData,
  type WeeklyTrendPoint,
  type ImmersionReportData,
} from '@/lib/actions/report';
import { ImmersionReportView } from '@/components/report/immersion-report-view';

function shiftWeekMonday(mondayStr: string, deltaWeeks: number): string {
  const ms = new Date(`${mondayStr}T12:00:00+09:00`).getTime();
  return formatDateKST(new Date(ms + deltaWeeks * 7 * 24 * 60 * 60 * 1000));
}

function getWeekNumberKST(mondayStr: string): number {
  const d = new Date(`${mondayStr}T12:00:00+09:00`);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}

function formatWeekTitle(mondayStr: string): string {
  const d = new Date(`${mondayStr}T12:00:00+09:00`);
  const year = d.getFullYear();
  const weekNum = getWeekNumberKST(mondayStr);
  return `${year}년 ${weekNum}주차`;
}

function formatWeekDateRange(mondayStr: string): string {
  const dates = getWeekDateStringsFromMondayKST(mondayStr);
  const start = dates[0]!;
  const end = dates[6]!;
  const parse = (s: string) => {
    const [y, m, day] = s.split('-').map(Number);
    return new Date(y!, m! - 1, day!);
  };
  const a = parse(start);
  const b = parse(end);
  return `${a.getMonth() + 1}월 ${a.getDate()}일(월) ~ ${b.getMonth() + 1}월 ${b.getDate()}일(일)`;
}

interface StudentReportClientProps {
  studentId: string;
  initialReport: ImmersionReportData | null;
  initialTrend: WeeklyTrendPoint[];
  initialWeekStart: string;
  currentWeekMondayStr: string;
}

export function StudentReportClient({
  studentId,
  initialReport,
  initialTrend,
  initialWeekStart,
  currentWeekMondayStr,
}: StudentReportClientProps) {
  const [weekStartStr, setWeekStartStr] = useState(initialWeekStart);
  const [report, setReport] = useState<ImmersionReportData | null>(initialReport);
  const [isPending, startTransition] = useTransition();

  const fetchReport = useCallback(
    (weekMonday: string) => {
      startTransition(async () => {
        const data = await getImmersionReportData(studentId, weekMonday);
        setReport(data);
      });
    },
    [studentId]
  );

  const goToPrevWeek = () => {
    const prev = shiftWeekMonday(weekStartStr, -1);
    setWeekStartStr(prev);
    fetchReport(prev);
  };

  const goToNextWeek = () => {
    if (weekStartStr >= currentWeekMondayStr) return;
    const next = shiftWeekMonday(weekStartStr, 1);
    setWeekStartStr(next);
    fetchReport(next);
  };

  const isCurrentWeek = weekStartStr === currentWeekMondayStr;

  return (
    <div className="p-4 space-y-4 pb-20">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goToPrevWeek}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100"
            aria-label="이전 주"
          >
            <ChevronLeft className="h-5 w-5 text-text-muted" />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-text">
              {formatWeekTitle(weekStartStr)}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {formatWeekDateRange(weekStartStr)}
            </p>
          </div>
          <button
            type="button"
            onClick={goToNextWeek}
            disabled={isCurrentWeek}
            aria-label="다음 주"
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
              isCurrentWeek
                ? 'cursor-not-allowed text-gray-200'
                : 'text-text-muted hover:bg-gray-100'
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </Card>

      {isPending && (
        <div className="py-2 text-center">
          <span className="animate-pulse text-xs text-text-muted">
            불러오는 중...
          </span>
        </div>
      )}

      {!report ? (
        <Card className="p-8">
          <div className="flex flex-col items-center text-center">
            <UserX className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-text-muted">
              데이터를 불러올 수 없습니다.
            </p>
          </div>
        </Card>
      ) : (
        <div
          className={cn(
            'space-y-4',
            isPending && 'pointer-events-none opacity-50'
          )}
        >
          <ImmersionReportView
            report={report}
            weeklyTrend={initialTrend}
            editable={false}
          />
        </div>
      )}
    </div>
  );
}
