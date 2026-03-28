'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { WeeklyTrendPoint } from '@/lib/actions/report';

export interface WeeklyTrendChartProps {
  data: WeeklyTrendPoint[];
}

function secondsToHoursLabel(seconds: number): string {
  return `${Math.round(seconds / 3600)}시간`;
}

export function WeeklyTrendChart({ data }: WeeklyTrendChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <h3 className="text-lg font-semibold text-text">주별 학습현황</h3>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-text-muted">표시할 데이터가 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  const vbW = 360;
  const vbH = 180;
  const padL = 44;
  const padR = 14;
  const padT = 36;
  const padB = 36;
  const chartW = vbW - padL - padR;
  const chartH = vbH - padT - padB;

  const maxSeconds = Math.max(
    ...data.flatMap((d) => [d.mySeconds, d.gradeMaxSeconds, d.gradeAvgSeconds]),
    3600
  );

  const n = data.length;
  const getX = (i: number) =>
    n <= 1 ? padL + chartW / 2 : padL + (i / (n - 1)) * chartW;

  const getY = (seconds: number) =>
    padT + chartH - (seconds / maxSeconds) * chartH;

  const gridRatios = [0.25, 0.5, 0.75, 1];
  const gridLines = gridRatios.map((ratio) => ({
    y: padT + chartH * (1 - ratio),
    label: secondsToHoursLabel(maxSeconds * ratio),
  }));

  const poly = (vals: number[]) =>
    vals.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');

  const myPts = data.map((d) => d.mySeconds);
  const maxPts = data.map((d) => d.gradeMaxSeconds);
  const avgPts = data.map((d) => d.gradeAvgSeconds);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-text">주별 학습현황</h3>
          <div className="flex flex-col items-end gap-1 text-[9px] leading-tight text-text-muted">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full bg-primary" />
              <span>나의 순공</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width={16} height={6} className="shrink-0">
                <line
                  x1="0"
                  y1="3"
                  x2="16"
                  y2="3"
                  stroke="#F5A623"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              </svg>
              <span>동일 학년(최고)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width={16} height={6} className="shrink-0">
                <line
                  x1="0"
                  y1="3"
                  x2="16"
                  y2="3"
                  stroke="#9CA3AF"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              </svg>
              <span>학년 평균</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          className="h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {gridLines.map((line, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={line.y}
                x2={vbW - padR}
                y2={line.y}
                stroke="#f0f0f0"
                strokeWidth="1"
              />
              <text
                x={padL - 6}
                y={line.y + 3}
                textAnchor="end"
                fontSize="8"
                fill="#9ca3af"
              >
                {line.label}
              </text>
            </g>
          ))}

          <polyline
            points={poly(maxPts)}
            fill="none"
            stroke="#F5A623"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={poly(avgPts)}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline
            points={poly(myPts)}
            fill="none"
            stroke="#7C9FF5"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {myPts.map((sec, i) => (
            <circle
              key={i}
              cx={getX(i)}
              cy={getY(sec)}
              r="4"
              fill="#7C9FF5"
              stroke="#fff"
              strokeWidth="1.5"
            />
          ))}

          {data.map((d, i) => (
            <text
              key={i}
              x={getX(i)}
              y={vbH - 8}
              textAnchor="middle"
              fontSize="9"
              fill="#6b7280"
            >
              {d.weekLabel}
            </text>
          ))}
        </svg>
      </CardContent>
    </Card>
  );
}
