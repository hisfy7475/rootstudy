'use client';

import { useState, useTransition, useCallback } from 'react';
import { ChevronLeft, ChevronRight, UserX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ImmersionReportView } from '@/components/report/immersion-report-view';
import { cn, formatDateKST, getWeekDateStringsFromMondayKST } from '@/lib/utils';
import {
  getImmersionReportData,
  getWeeklyStudyTrend,
  type ImmersionReportData,
  type WeeklyTrendPoint,
} from '@/lib/actions/report';
import type { LinkedStudent } from '@/lib/actions/parent';

function addWeeksToMondayKST(mondayYmd: string, deltaWeeks: number): string {
  const base = new Date(`${mondayYmd}T12:00:00+09:00`).getTime();
  return formatDateKST(new Date(base + deltaWeeks * 7 * 24 * 60 * 60 * 1000));
}

function formatWeekRangeTitle(mondayYmd: string): string {
  const dates = getWeekDateStringsFromMondayKST(mondayYmd);
  const start = dates[0]!;
  const end = dates[6]!;
  const [y1, m1, d1] = start.split('-').map(Number);
  const [, m2, d2] = end.split('-').map(Number);
  return `${y1}년 ${m1}월 ${d1}일(월) ~ ${m2}월 ${d2}일(일)`;
}

interface ParentReportClientProps {
  students: LinkedStudent[];
  initialStudentId: string;
  initialWeekStart: string;
  /** 이번 주(학습일 기준) 월요일 YYYY-MM-DD — 다음 주 이동 상한 */
  currentWeekStartMonday: string;
  initialReport: ImmersionReportData | null;
  initialTrend: WeeklyTrendPoint[];
}

export function ParentReportClient({
  students,
  initialStudentId,
  initialWeekStart,
  currentWeekStartMonday,
  initialReport,
  initialTrend,
}: ParentReportClientProps) {
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [weekStartMonday, setWeekStartMonday] = useState(initialWeekStart);
  const [report, setReport] = useState<ImmersionReportData | null>(initialReport);
  const [trend, setTrend] = useState<WeeklyTrendPoint[]>(initialTrend);
  const [isPending, startTransition] = useTransition();

  const fetchReport = useCallback((studentId: string, weekMonday: string) => {
    startTransition(async () => {
      const [nextReport, nextTrend] = await Promise.all([
        getImmersionReportData(studentId, weekMonday),
        getWeeklyStudyTrend(studentId, 8),
      ]);
      setReport(nextReport);
      setTrend(nextTrend);
    });
  }, []);

  const goToPrevWeek = () => {
    const prev = addWeeksToMondayKST(weekStartMonday, -1);
    setWeekStartMonday(prev);
    fetchReport(selectedStudentId, prev);
  };

  const goToNextWeek = () => {
    const next = addWeeksToMondayKST(weekStartMonday, 1);
    if (next > currentWeekStartMonday) return;
    setWeekStartMonday(next);
    fetchReport(selectedStudentId, next);
  };

  const handleStudentChange = (id: string) => {
    setSelectedStudentId(id);
    fetchReport(id, weekStartMonday);
  };

  const isCurrentWeek = weekStartMonday === currentWeekStartMonday;

  return (
    <div className="p-4 space-y-4 pb-20">
      {students.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleStudentChange(s.id)}
              className={cn(
                'flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                selectedStudentId === s.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-muted'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goToPrevWeek}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-text-muted" />
          </button>
          <div className="text-center px-2">
            <p className="font-semibold text-text text-sm">주간 리포트</p>
            <p className="text-xs text-text-muted mt-0.5">
              {formatWeekRangeTitle(weekStartMonday)}
            </p>
          </div>
          <button
            type="button"
            onClick={goToNextWeek}
            disabled={isCurrentWeek}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
              isCurrentWeek
                ? 'text-gray-200 cursor-not-allowed'
                : 'hover:bg-gray-100 text-text-muted'
            )}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </Card>

      {isPending && (
        <div className="text-center py-2">
          <span className="text-xs text-text-muted animate-pulse">불러오는 중...</span>
        </div>
      )}

      {!report ? (
        <Card className="p-8">
          <div className="flex flex-col items-center text-center">
            <UserX className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm text-text-muted">데이터를 불러올 수 없습니다.</p>
          </div>
        </Card>
      ) : (
        <div className={cn(isPending && 'opacity-50 pointer-events-none')}>
          <ImmersionReportView
            report={report}
            weeklyTrend={trend}
            editable={false}
          />
        </div>
      )}
    </div>
  );
}
