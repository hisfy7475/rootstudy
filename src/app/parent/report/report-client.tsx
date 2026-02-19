'use client';

import { useState, useTransition, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Brain, Clock, UserX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getWeeklyReportData } from '@/lib/actions/parent';
import type { WeeklyReportData, LinkedStudent } from '@/lib/actions/parent';

// ─────────────────────────────────────────────
// 유틸 함수
// ─────────────────────────────────────────────

function formatStudyTime(seconds: number): string {
  if (seconds === 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `0:${String(m).padStart(2, '0')}`;
}

function formatStudyTimeLabel(seconds: number): string {
  if (seconds === 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}:${String(m).padStart(2, '0')}`;
  if (h > 0) return `${h}:00`;
  return `0:${String(m).padStart(2, '0')}`;
}

function getWeekStartFromISO(iso: string): Date {
  return new Date(iso);
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatWeekLabel(weekStart: Date): string {
  const year = weekStart.getFullYear();
  const weekNum = getWeekNumber(weekStart);
  return `${year}년 ${weekNum}주차`;
}

function formatDateRange(weekStart: Date, weekEnd: Date): string {
  const startM = weekStart.getMonth() + 1;
  const startD = weekStart.getDate();
  const endM = weekEnd.getMonth() + 1;
  const endD = weekEnd.getDate();
  return `${startM}월 ${startD}일(월) ~ ${endM}월 ${endD}일(일)`;
}

// ─────────────────────────────────────────────
// SVG 꺾은선 그래프
// ─────────────────────────────────────────────

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function StudyTimeChart({ dailyData }: { dailyData: WeeklyReportData['dailyData'] }) {
  const svgWidth = 320;
  const svgHeight = 140;
  const paddingX = 24;
  const paddingTop = 28;
  const paddingBottom = 28;
  const chartWidth = svgWidth - paddingX * 2;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxSeconds = Math.max(...dailyData.map((d) => d.studySeconds), 3600);
  const stepX = chartWidth / (dailyData.length - 1);

  const getX = (i: number) => paddingX + i * stepX;
  const getY = (seconds: number) =>
    paddingTop + chartHeight - (seconds / maxSeconds) * chartHeight;

  const points = dailyData.map((d, i) => ({
    x: getX(i),
    y: getY(d.studySeconds),
    seconds: d.studySeconds,
    label: formatStudyTimeLabel(d.studySeconds),
  }));

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Y축 눈금선 (4개)
  const gridLines = [0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: paddingTop + chartHeight * (1 - ratio),
    label: formatStudyTime(Math.round(maxSeconds * ratio)),
  }));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full"
        style={{ minWidth: 280 }}
      >
        {/* 배경 눈금선 */}
        {gridLines.map((line, i) => (
          <line
            key={i}
            x1={paddingX}
            y1={line.y}
            x2={svgWidth - paddingX}
            y2={line.y}
            stroke="#f0f0f0"
            strokeWidth="1"
          />
        ))}

        {/* 꺾은선 */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 각 포인트 */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill={p.seconds > 0 ? '#f97316' : '#d1d5db'}
              stroke="white"
              strokeWidth="1.5"
            />
            {/* 시간 라벨 */}
            {p.label && (
              <text
                x={p.x}
                y={p.y - 9}
                textAnchor="middle"
                fontSize="9"
                fill="#374151"
                fontWeight="500"
              >
                {p.label}
              </text>
            )}
          </g>
        ))}

        {/* X축 요일 라벨 */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={svgHeight - 4}
            textAnchor="middle"
            fontSize="10"
            fill="#9ca3af"
          >
            {DAY_LABELS[i]}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────
// 출결 원형 그래프
// ─────────────────────────────────────────────

function AttendanceCircle({ rate }: { rate: number }) {
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (rate / 100) * circumference;

  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="#f97316"
        strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="44" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#111827">
        {rate}%
      </text>
      <text x="48" y="58" textAnchor="middle" fontSize="9" fill="#6b7280">
        출석률
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────
// 몰입도 막대 그래프
// ─────────────────────────────────────────────

function FocusBarChart({ dailyData }: { dailyData: WeeklyReportData['dailyData'] }) {
  const maxScore = 100;

  return (
    <div className="flex items-end gap-2 h-16 mt-2">
      {dailyData.map((d, i) => {
        const heightPct = d.focusAvg !== null ? (d.focusAvg / maxScore) * 100 : 0;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <span className="text-[10px] text-text-muted font-medium leading-none">
              {d.focusAvg !== null ? d.focusAvg : ''}
            </span>
            <div className="w-full bg-gray-100 rounded-sm overflow-hidden" style={{ height: 40 }}>
              <div
                className="w-full bg-secondary/70 rounded-sm transition-all duration-300"
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

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────

interface ReportClientProps {
  students: LinkedStudent[];
  initialStudentId: string;
  initialWeekStart: string;
  initialReport: WeeklyReportData | null;
}

export function ReportClient({
  students,
  initialStudentId,
  initialWeekStart,
  initialReport,
}: ReportClientProps) {
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId);
  const [weekStartISO, setWeekStartISO] = useState(initialWeekStart);
  const [report, setReport] = useState<WeeklyReportData | null>(initialReport);
  const [isPending, startTransition] = useTransition();

  const fetchReport = useCallback(
    (studentId: string, weekISO: string) => {
      startTransition(async () => {
        const weekStart = new Date(weekISO);
        const data = await getWeeklyReportData(studentId, weekStart);
        setReport(data);
      });
    },
    []
  );

  const goToPrevWeek = () => {
    const prev = new Date(weekStartISO);
    prev.setDate(prev.getDate() - 7);
    const iso = prev.toISOString();
    setWeekStartISO(iso);
    fetchReport(selectedStudentId, iso);
  };

  const goToNextWeek = () => {
    const next = new Date(weekStartISO);
    next.setDate(next.getDate() + 7);
    // 미래 주는 이번 주 이상 불가
    const thisWeekMonday = getThisWeekMonday();
    if (next > thisWeekMonday) return;
    const iso = next.toISOString();
    setWeekStartISO(iso);
    fetchReport(selectedStudentId, iso);
  };

  const handleStudentChange = (id: string) => {
    setSelectedStudentId(id);
    fetchReport(id, weekStartISO);
  };

  function getThisWeekMonday(): Date {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  const weekStart = getWeekStartFromISO(weekStartISO);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const isCurrentWeek =
    weekStart.toDateString() === getThisWeekMonday().toDateString();

  return (
    <div className="p-4 space-y-4 pb-20">
      {/* 자녀 탭 (다자녀) */}
      {students.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {students.map((s) => (
            <button
              key={s.id}
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

      {/* 주차 선택 */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevWeek}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-text-muted" />
          </button>
          <div className="text-center">
            <p className="font-semibold text-text text-sm">{formatWeekLabel(weekStart)}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {formatDateRange(weekStart, weekEnd)}
            </p>
          </div>
          <button
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

      {/* 로딩 오버레이 */}
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
        <div className={cn('space-y-4', isPending && 'opacity-50 pointer-events-none')}>
          {/* ─── 출결 관리 ─── */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-5 bg-primary rounded-full" />
              <h3 className="font-semibold text-text">출결 관리</h3>
              <span className="ml-auto text-xs text-text-muted">일 기준 출결 비율</span>
            </div>

            {report.attendanceStat.totalWeekdays === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                아직 집계할 출석 데이터가 없습니다.
              </p>
            ) : (
              <div className="flex items-center gap-6">
                <AttendanceCircle rate={report.attendanceStat.attendanceRate} />
                <div className="space-y-2.5 flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-muted">결석</span>
                    <span className="text-sm font-semibold text-red-500">
                      {report.attendanceStat.absentRate}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-muted">정상 출석</span>
                    <span className="text-sm font-semibold text-orange-500">
                      {report.attendanceStat.attendanceRate}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-text-muted border-t border-gray-100 pt-2 mt-1">
                    <span>
                      출석 {report.attendanceStat.attendedDays}일 /{' '}
                      {report.attendanceStat.totalWeekdays}일
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* ─── 순수 공부 시간 ─── */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-5 bg-primary rounded-full" />
              <h3 className="font-semibold text-text">순수 공부 시간</h3>
            </div>

            {/* 주간 합계 */}
            <div className="flex items-center gap-2 mb-3 ml-3.5">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-sm text-text-muted">
                주간 합계:{' '}
                <span className="font-bold text-text">
                  {formatStudyTimeFull(
                    report.dailyData.reduce((sum, d) => sum + d.studySeconds, 0)
                  )}
                </span>
              </span>
            </div>

            <StudyTimeChart dailyData={report.dailyData} />
          </Card>

          {/* ─── 몰입도 ─── */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-5 bg-secondary rounded-full" />
              <h3 className="font-semibold text-text">몰입도</h3>
              {report.weeklyFocusAvg !== null && (
                <span className="ml-auto flex items-center gap-1 text-sm font-bold text-secondary">
                  <Brain className="w-4 h-4" />
                  주간 평균 {report.weeklyFocusAvg}점
                </span>
              )}
            </div>

            {report.weeklyFocusAvg === null ? (
              <p className="text-sm text-text-muted text-center py-4">
                이번 주 몰입도 기록이 없습니다.
              </p>
            ) : (
              <FocusBarChart dailyData={report.dailyData} />
            )}
          </Card>

          {/* ─── 일별 순공시간 상세 ─── */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-5 bg-gray-400 rounded-full" />
              <h3 className="font-semibold text-text">일별 학습 현황</h3>
            </div>
            <div className="space-y-2">
              {report.dailyData.map((d, i) => {
                const dateObj = new Date(d.date);
                const month = dateObj.getMonth() + 1;
                const dayNum = dateObj.getDate();
                const isFuture = dateObj > new Date(new Date().toDateString());
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0"
                  >
                    <div className="w-12 flex-shrink-0">
                      <span className="text-xs text-text-muted">
                        {DAY_LABELS[i]} {month}/{dayNum}
                      </span>
                    </div>
                    <div className="flex-1">
                      {isFuture ? (
                        <span className="text-xs text-gray-300">-</span>
                      ) : d.studySeconds > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/60 rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (d.studySeconds /
                                    Math.max(
                                      ...report.dailyData.map((x) => x.studySeconds),
                                      1
                                    )) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-text whitespace-nowrap flex-shrink-0 text-right min-w-[56px]">
                            {formatStudyTimeFull(d.studySeconds)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">미출석</span>
                      )}
                    </div>
                    {d.focusAvg !== null && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <Brain className="w-3 h-3 text-secondary/60" />
                        <span className="text-xs text-text-muted">{d.focusAvg}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function formatStudyTimeFull(seconds: number): string {
  if (seconds === 0) return '0분';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}
