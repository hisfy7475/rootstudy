'use client';

import { cn } from '@/lib/utils';
import type { ImmersionReportData, WeeklyTrendPoint } from '@/lib/actions/report';
import { AttendanceCard } from './attendance-card';
import { StudyTimeCard } from './study-time-card';
import { FocusScoreCard } from './focus-score-card';
import { SubjectBandChart } from './subject-band-chart';
import { WeeklyTrendChart } from './weekly-trend-chart';
import { PointsSummaryCard } from './points-summary-card';
import { ExamScoreCard } from './exam-score-card';
import {
  CounselingReportCard,
  type CounselingReportCardSavePayload,
} from './counseling-report-card';

export interface ImmersionReportViewProps {
  report: ImmersionReportData;
  weeklyTrend: WeeklyTrendPoint[];
  editable?: boolean;
  /**
   * 데스크탑(md 이상) 에서 차트 2열 그리드 + 상담 카드 풀폭으로 표시.
   * 기본값 false 로 학부모·학생 측의 모바일 1열 유지.
   */
  desktopGrid?: boolean;
  onSaveCounseling?: (data: CounselingReportCardSavePayload) => void;
  /** 관리자: 템플릿 재적용 (인자: 입력 중 관리자 메모) */
  onReapplyCounseling?: (currentAdminNotes: string) => void | Promise<void>;
}

export function ImmersionReportView({
  report,
  weeklyTrend,
  editable = false,
  desktopGrid = false,
  onSaveCounseling,
  onReapplyCounseling,
}: ImmersionReportViewProps) {
  if (desktopGrid) {
    return (
      <div className='w-full pb-6'>
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <AttendanceCard attendanceStat={report.attendanceStat} />
          <StudyTimeCard
            dailyData={report.dailyData}
            gradeAvgSeconds={report.gradeStudyPeerAvgSeconds}
          />
          <FocusScoreCard dailyData={report.dailyData} weeklyFocusAvg={report.weeklyFocusAvg} />
          <ExamScoreCard data={report.examScores} />
          <SubjectBandChart data={report.subjectByDay} />
          <WeeklyTrendChart data={weeklyTrend} />
          <PointsSummaryCard points={report.points} />
          <div className={cn('md:col-span-2')}>
            <CounselingReportCard
              counseling={report.counseling}
              studentName={report.studentName}
              studentTypeName={report.studentTypeName}
              editable={editable}
              mentoringRecords={report.mentoringRecords}
              onSave={onSaveCounseling}
              onReapplyTemplate={onReapplyCounseling}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-lg space-y-4 pb-6'>
      <AttendanceCard attendanceStat={report.attendanceStat} />
      <StudyTimeCard
        dailyData={report.dailyData}
        gradeAvgSeconds={report.gradeStudyPeerAvgSeconds}
      />
      <FocusScoreCard dailyData={report.dailyData} weeklyFocusAvg={report.weeklyFocusAvg} />
      <ExamScoreCard data={report.examScores} />
      <SubjectBandChart data={report.subjectByDay} />
      <WeeklyTrendChart data={weeklyTrend} />
      <PointsSummaryCard points={report.points} />
      <CounselingReportCard
        counseling={report.counseling}
        studentName={report.studentName}
        studentTypeName={report.studentTypeName}
        editable={editable}
        mentoringRecords={report.mentoringRecords}
        onSave={onSaveCounseling}
        onReapplyTemplate={onReapplyCounseling}
      />
    </div>
  );
}
