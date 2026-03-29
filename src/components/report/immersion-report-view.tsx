'use client';

import type { RefObject } from 'react';
import { cn } from '@/lib/utils';
import type {
  ImmersionReportData,
  WeeklyTrendPoint,
} from '@/lib/actions/report';
import { AttendanceCard } from './attendance-card';
import { StudyTimeCard } from './study-time-card';
import { FocusScoreCard } from './focus-score-card';
import { SubjectBandChart } from './subject-band-chart';
import { WeeklyTrendChart } from './weekly-trend-chart';
import { PointsSummaryCard } from './points-summary-card';
import { CounselingReportCard } from './counseling-report-card';

export interface ImmersionReportViewProps {
  report: ImmersionReportData;
  weeklyTrend: WeeklyTrendPoint[];
  editable?: boolean;
  onSaveCounseling?: (data: {
    studyFeedback: string;
    guidanceNotes: string;
    adminNotes: string;
    parentSummary: string;
  }) => void;
  /** 관리자: 템플릿 재적용 (인자: 입력 중 관리자 메모) */
  onReapplyCounseling?: (currentAdminNotes: string) => void | Promise<void>;
  printRef?: RefObject<HTMLDivElement | null>;
}

export function ImmersionReportView({
  report,
  weeklyTrend,
  editable = false,
  onSaveCounseling,
  onReapplyCounseling,
  printRef,
}: ImmersionReportViewProps) {
  const printDateStr = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const weekRangeLabel = (() => {
    const a = report.dailyData[0]?.date;
    const b = report.dailyData[6]?.date;
    if (!a || !b) return '';
    const fmt = (iso: string) =>
      new Date(iso + 'T12:00:00+09:00').toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
      });
    return `${fmt(a)}(월) ~ ${fmt(b)}(일)`;
  })();

  const cardClass = 'print:break-inside-avoid';

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-6 print:max-w-none print:pb-0">
      <div
        ref={printRef}
        className={cn(
          'print-report space-y-4',
          'print:grid print:grid-cols-2 print:gap-3 print:p-0'
        )}
      >
        <div
          className={cn(
            'hidden print:col-span-2 print:block print:break-inside-avoid',
            'mb-0 border-b border-gray-200 pb-3 text-center print:mb-3'
          )}
        >
          <p className="text-lg font-bold text-text">{report.studentName}</p>
          <p className="mt-1 text-sm text-text-muted">
            {report.studentTypeName ?? '학년 미지정'}
            {report.seatNumber != null ? ` · 좌석 ${report.seatNumber}` : ''}
            {weekRangeLabel ? ` · ${weekRangeLabel}` : ''}
          </p>
        </div>
        <div className={cardClass}>
          <AttendanceCard attendanceStat={report.attendanceStat} />
        </div>
        <div className={cardClass}>
          <StudyTimeCard
            dailyData={report.dailyData}
            gradeAvgSeconds={report.gradeStudyAvgSeconds}
          />
        </div>
        <div className={cardClass}>
          <FocusScoreCard
            dailyData={report.dailyData}
            weeklyFocusAvg={report.weeklyFocusAvg}
          />
        </div>
        <div className={cardClass}>
          <SubjectBandChart data={report.subjectByDay} />
        </div>
        <div className={cardClass}>
          <WeeklyTrendChart data={weeklyTrend} />
        </div>
        <div className={cardClass}>
          <PointsSummaryCard points={report.points} />
        </div>
        <div className={cn(cardClass, 'print:col-span-2')}>
          <CounselingReportCard
            counseling={report.counseling}
            studentName={report.studentName}
            studentTypeName={report.studentTypeName}
            editable={editable}
            onSave={onSaveCounseling}
            onReapplyTemplate={onReapplyCounseling}
          />
        </div>

        <p className="hidden text-center text-xs text-text-muted print:col-span-2 print:block print:break-inside-avoid">
          인쇄 일시 (KST): {printDateStr}
        </p>
      </div>
    </div>
  );
}
