'use client';

import type { ImmersionReportData, WeeklyTrendPoint } from '@/lib/actions/report';
import { AttendanceCard } from './attendance-card';
import { StudyTimeCard } from './study-time-card';
import { FocusScoreCard } from './focus-score-card';
import { SubjectBandChart } from './subject-band-chart';
import { WeeklyTrendChart } from './weekly-trend-chart';
import { PointsSummaryCard } from './points-summary-card';
import { ExamScoreCard } from './exam-score-card';

const MENTORING_TYPE_LABEL: Record<string, string> = {
  mentoring: '멘토링',
  clinic: '클리닉',
  consult: '상담',
};

export interface ImmersionReportPrintViewProps {
  report: ImmersionReportData;
  weeklyTrend: WeeklyTrendPoint[];
  /** 페이지 break 강제 (여러 학생 일괄 출력 시 사용). 단일 출력에서는 false. */
  pageBreakAfter?: boolean;
}

function formatWeekRange(report: ImmersionReportData): string {
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
}

function PrintTextSection({ label, value }: { label: string; value: string }) {
  const text = value.trim();
  if (text === '') return null;
  return (
    <section className='print-text-section mb-3'>
      <p className='print-text-label border-primary mb-1 border-l-4 pl-2 text-[10pt] font-semibold text-gray-700'>
        {label}
      </p>
      <div className='border-l border-gray-200 pl-3'>
        {text.split(/\n+/).map((para, idx) => (
          <p
            key={idx}
            className='print-text-body mb-1 text-[10pt] leading-relaxed whitespace-pre-wrap text-gray-900'
          >
            {para}
          </p>
        ))}
      </div>
    </section>
  );
}

/**
 * 인쇄 전용 리포트 컴포넌트.
 *
 * 화면용 ImmersionReportView 와 별도로 두어, 페이지 경계에서 텍스트가 잘리지 않도록
 * 분석 카드(차트류)는 2열 그리드, 텍스트 섹션은 1열 풀폭으로 배치하고
 * 단락 단위로만 break-inside avoid 를 적용한다.
 */
export function ImmersionReportPrintView({
  report,
  weeklyTrend,
  pageBreakAfter = false,
}: ImmersionReportPrintViewProps) {
  const printDateStr = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const weekRange = formatWeekRange(report);
  const c = report.counseling;
  const studyFeedbackForPrint = c.studyFeedbackFull?.trim() || c.studyFeedback;

  return (
    <div
      className='print-report-page'
      style={{
        ...(pageBreakAfter ? { pageBreakAfter: 'always', breakAfter: 'page' } : {}),
      }}
    >
      <header
        className='print-report-header'
        style={{
          textAlign: 'center',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '8px',
          marginBottom: '10px',
          breakInside: 'avoid',
          pageBreakInside: 'avoid',
        }}
      >
        <p style={{ fontSize: '14pt', fontWeight: 700, color: '#111827' }}>{report.studentName}</p>
        <p style={{ fontSize: '9pt', color: '#6b7280', marginTop: '2px' }}>
          {report.studentTypeName ?? '학년 미지정'}
          {report.seatNumber != null ? ` · 좌석 ${report.seatNumber}` : ''}
          {weekRange ? ` · ${weekRange}` : ''}
        </p>
      </header>

      <div
        className='print-report-grid'
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          marginBottom: '10px',
        }}
      >
        <div
          className='print-report-card'
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <AttendanceCard attendanceStat={report.attendanceStat} />
        </div>
        <div
          className='print-report-card'
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <StudyTimeCard
            dailyData={report.dailyData}
            gradeAvgSeconds={report.gradeStudyPeerAvgSeconds}
          />
        </div>
        <div
          className='print-report-card'
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <FocusScoreCard dailyData={report.dailyData} weeklyFocusAvg={report.weeklyFocusAvg} />
        </div>
        <div
          className='print-report-card'
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <ExamScoreCard data={report.examScores} />
        </div>
        <div
          className='print-report-card'
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <SubjectBandChart data={report.subjectByDay} />
        </div>
        <div
          className='print-report-card'
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <WeeklyTrendChart data={weeklyTrend} />
        </div>
        <div
          className='print-report-card'
          style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
        >
          <PointsSummaryCard points={report.points} />
        </div>
      </div>

      <div
        className='print-report-text-block'
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '10px 12px',
          marginTop: '8px',
        }}
      >
        <p
          style={{
            fontSize: '12pt',
            fontWeight: 700,
            color: '#111827',
            marginBottom: '6px',
            borderBottom: '1px solid #e5e7eb',
            paddingBottom: '4px',
          }}
        >
          상담 리포트
        </p>
        <p
          style={{
            fontSize: '9pt',
            color: '#6b7280',
            marginBottom: '8px',
          }}
        >
          학생명 <span style={{ color: '#111827', fontWeight: 600 }}>{report.studentName}</span>
          {' · '}학년{' '}
          <span style={{ color: '#111827', fontWeight: 600 }}>{report.studentTypeName ?? '—'}</span>
          {' · '}몰입도{' '}
          <span style={{ color: '#111827', fontWeight: 600 }}>
            {c.focusAvg !== null ? `평균 ${c.focusAvg}점` : '미측정'}
            {c.scoreLabel ? ` (${c.scoreLabel})` : ''}
          </span>
        </p>
        <PrintTextSection label='학습 태도' value={studyFeedbackForPrint} />
        {report.mentoringRecords.length > 0 && (
          <PrintTextSection
            label='상담/멘토링 레터'
            value={report.mentoringRecords
              .map(
                (rec) =>
                  `[${rec.date} · ${MENTORING_TYPE_LABEL[rec.type] ?? rec.type}${
                    rec.mentorName ? ` · ${rec.mentorName}` : ''
                  }] ${rec.resultNote}`,
              )
              .join('\n')}
          />
        )}
        <PrintTextSection label='학부모 상담 요약' value={c.parentSummary} />
        <PrintTextSection label='관리자 추가 메모' value={c.adminNotes ?? ''} />
      </div>

      <p
        className='print-report-footer'
        style={{
          textAlign: 'center',
          fontSize: '8pt',
          color: '#9ca3af',
          marginTop: '10px',
        }}
      >
        인쇄 일시 (KST): {printDateStr}
      </p>
    </div>
  );
}
