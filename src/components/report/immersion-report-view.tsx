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
  printRef?: RefObject<HTMLDivElement | null>;
}

export function ImmersionReportView({
  report,
  weeklyTrend,
  editable = false,
  onSaveCounseling,
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

  const cardClass = 'print:break-inside-avoid';

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-6">
      <div
        ref={printRef}
        className={cn(
          'print-report space-y-4',
          'print:grid print:grid-cols-2 print:gap-4 print:p-4'
        )}
      >
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
          />
        </div>

        <p className="hidden text-center text-xs text-text-muted print:col-span-2 print:block print:break-inside-avoid">
          인쇄 일시 (KST): {printDateStr}
        </p>
      </div>
    </div>
  );
}
