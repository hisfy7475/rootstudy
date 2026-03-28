'use client';

import { Clock } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { DailyReportData } from '@/lib/actions/report';

export interface StudyTimeCardProps {
  dailyData: DailyReportData[];
  gradeAvgSeconds: number;
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

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

function formatStudyTimeFull(seconds: number): string {
  if (seconds === 0) return '0분';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function StudyTimeChart({
  dailyData,
  gradeAvgDailySeconds,
}: {
  dailyData: DailyReportData[];
  gradeAvgDailySeconds: number;
}) {
  const svgWidth = 320;
  const svgHeight = 140;
  const paddingX = 24;
  const paddingTop = 28;
  const paddingBottom = 28;
  const chartWidth = svgWidth - paddingX * 2;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxSeconds = Math.max(
    ...dailyData.map((d) => d.studySeconds),
    gradeAvgDailySeconds,
    3600
  );
  const stepX = chartWidth / Math.max(dailyData.length - 1, 1);

  const getX = (i: number) =>
    dailyData.length <= 1
      ? paddingX + chartWidth / 2
      : paddingX + i * stepX;
  const getY = (seconds: number) =>
    paddingTop + chartHeight - (seconds / maxSeconds) * chartHeight;

  const points = dailyData.map((d, i) => ({
    x: getX(i),
    y: getY(d.studySeconds),
    seconds: d.studySeconds,
    label: formatStudyTimeLabel(d.studySeconds),
  }));

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const gradeY = getY(gradeAvgDailySeconds);

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

        <line
          x1={paddingX}
          y1={gradeY}
          x2={svgWidth - paddingX}
          y2={gradeY}
          stroke="#9CA3AF"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />

        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#7C9FF5"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill={p.seconds > 0 ? '#7C9FF5' : '#d1d5db'}
              stroke="white"
              strokeWidth="1.5"
            />
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

export function StudyTimeCard({ dailyData, gradeAvgSeconds }: StudyTimeCardProps) {
  const weekTotal = dailyData.reduce((sum, d) => sum + d.studySeconds, 0);
  const gradeAvgDaily = gradeAvgSeconds / 7;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-1.5 rounded-full bg-primary" />
          <h3 className="text-lg font-semibold leading-none tracking-tight text-text">
            순수 공부 시간
          </h3>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 ml-0.5 flex flex-col gap-1 sm:ml-3.5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm text-text-muted">
              주간 합계:{' '}
              <span className="font-bold text-text">{formatStudyTimeFull(weekTotal)}</span>
            </span>
          </div>
          <p className="pl-6 text-xs text-text-muted">
            동일 학년 평균:{' '}
            <span className="font-medium text-text">{formatStudyTimeFull(gradeAvgSeconds)}</span>{' '}
            (주간)
          </p>
        </div>
        <StudyTimeChart
          dailyData={dailyData}
          gradeAvgDailySeconds={gradeAvgDaily}
        />
      </CardContent>
    </Card>
  );
}
