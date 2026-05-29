'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { ExamScoreReportData, ExamScoreRow } from '@/lib/actions/report';

export interface ExamScoreCardProps {
  data: ExamScoreReportData;
}

// 과목별 추이 라인 색상 팔레트 (weekly-trend-chart 와 동일 계열)
const SUBJECT_COLORS = ['#7C9FF5', '#F5A623', '#34C759', '#AF52DE', '#FF6B6B', '#5AC8FA'];

/** (examName, examDate) 회차 그룹 */
function groupWeekScores(rows: ExamScoreRow[]): Array<{
  examName: string;
  examDate: string;
  examType: string;
  items: ExamScoreRow[];
}> {
  const map = new Map<
    string,
    { examName: string; examDate: string; examType: string; items: ExamScoreRow[] }
  >();
  for (const r of rows) {
    const key = `${r.examDate}__${r.examName}`;
    let g = map.get(key);
    if (!g) {
      g = { examName: r.examName, examDate: r.examDate, examType: r.examType, items: [] };
      map.set(key, g);
    }
    g.items.push(r);
  }
  return Array.from(map.values()).sort((a, b) => b.examDate.localeCompare(a.examDate));
}

function PercentileTrend({ data }: { data: ExamScoreReportData }) {
  const { trend, subjects } = data;
  if (trend.length < 2 || subjects.length === 0) return null;

  const vbW = 360;
  const vbH = 180;
  const padL = 36;
  const padR = 14;
  const padT = 16;
  const padB = 36;
  const chartW = vbW - padL - padR;
  const chartH = vbH - padT - padB;

  const n = trend.length;
  const getX = (i: number) => (n <= 1 ? padL + chartW / 2 : padL + (i / (n - 1)) * chartW);
  // 백분위 0~100, 위가 100
  const getY = (p: number) => padT + chartH - (p / 100) * chartH;

  const gridRatios = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className='mt-4'>
      <p className='text-text-muted mb-1.5 text-xs font-semibold'>백분위 추이</p>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className='h-auto w-full'
        preserveAspectRatio='xMidYMid meet'
      >
        {gridRatios.map((ratio, i) => {
          const y = padT + chartH * (1 - ratio);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={vbW - padR} y2={y} stroke='#f0f0f0' strokeWidth='1' />
              <text x={padL - 6} y={y + 3} textAnchor='end' fontSize='8' fill='#9ca3af'>
                {Math.round(100 * ratio)}
              </text>
            </g>
          );
        })}

        {subjects.map((subject, si) => {
          const color = SUBJECT_COLORS[si % SUBJECT_COLORS.length];
          const pts = trend
            .map((t, i) => ({ i, p: t.bySubject[subject]?.percentile ?? null }))
            .filter((d) => d.p !== null) as { i: number; p: number }[];
          if (pts.length === 0) return null;
          const polyline = pts.map((d) => `${getX(d.i)},${getY(d.p)}`).join(' ');
          return (
            <g key={subject}>
              <polyline
                points={polyline}
                fill='none'
                stroke={color}
                strokeWidth='2'
                strokeLinejoin='round'
                strokeLinecap='round'
              />
              {pts.map((d) => (
                <circle
                  key={d.i}
                  cx={getX(d.i)}
                  cy={getY(d.p)}
                  r='3'
                  fill={color}
                  stroke='#fff'
                  strokeWidth='1'
                />
              ))}
            </g>
          );
        })}

        {trend.map((t, i) => (
          <text key={i} x={getX(i)} y={vbH - 8} textAnchor='middle' fontSize='8' fill='#6b7280'>
            {t.examName.length > 6 ? `${t.examName.slice(0, 6)}…` : t.examName}
          </text>
        ))}
      </svg>
      <div className='mt-2 flex flex-wrap gap-x-3 gap-y-1'>
        {subjects.map((subject, si) => (
          <div key={subject} className='flex items-center gap-1.5'>
            <span
              className='inline-block h-0.5 w-4 rounded-full'
              style={{ backgroundColor: SUBJECT_COLORS[si % SUBJECT_COLORS.length] }}
            />
            <span className='text-text-muted text-[10px]'>{subject}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExamScoreCard({ data }: ExamScoreCardProps) {
  const groups = groupWeekScores(data.weekScores);
  const hasTrend = data.trend.length >= 2 && data.subjects.length > 0;

  return (
    <Card>
      <CardHeader className='pb-2'>
        <h3 className='text-text text-lg font-semibold'>성적</h3>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className='text-text-muted py-6 text-center text-sm'>이번 주 시험 성적이 없습니다.</p>
        ) : (
          <div className='space-y-4'>
            {groups.map((g) => (
              <div key={`${g.examDate}__${g.examName}`}>
                <p className='text-text mb-1.5 text-sm font-medium'>
                  {g.examName}
                  <span className='text-text-muted ml-2 text-xs font-normal'>
                    {g.examDate} · {g.examType}
                  </span>
                </p>
                <div className='overflow-hidden rounded-2xl border border-gray-200'>
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='text-text-muted bg-gray-50 text-xs'>
                        <th className='px-3 py-2 text-left font-medium'>과목</th>
                        <th className='px-3 py-2 text-right font-medium'>원점수</th>
                        <th className='px-3 py-2 text-right font-medium'>표준</th>
                        <th className='px-3 py-2 text-right font-medium'>백분위</th>
                        <th className='px-3 py-2 text-right font-medium'>등급</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => (
                        <tr key={it.id} className='border-t border-gray-100'>
                          <td className='text-text px-3 py-2'>{it.subject}</td>
                          <td className='text-text px-3 py-2 text-right'>{it.rawScore ?? '—'}</td>
                          <td className='text-text px-3 py-2 text-right'>
                            {it.standardScore ?? '—'}
                          </td>
                          <td className='text-text px-3 py-2 text-right'>{it.percentile ?? '—'}</td>
                          <td className='text-text px-3 py-2 text-right font-medium'>
                            {it.grade !== null ? `${it.grade}등급` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasTrend && <PercentileTrend data={data} />}
      </CardContent>
    </Card>
  );
}
