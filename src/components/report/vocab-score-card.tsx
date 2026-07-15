'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { VocabExamReportData } from '@/lib/actions/report';

export interface VocabScoreCardProps {
  data: VocabExamReportData;
}

const BAR_COLOR = '#7C9FF5';

// 표시 축 만점 = 평일 시험 문항 수(40). 금요일 누적 오답 테스트는 total(문항 수)이 가변이라,
// 막대 높이는 정답률(score/total)을 이 40점 축으로 환산해 그린다.
const MAX_SCORE = 40;

/**
 * 요일별 영단어 테스트 막대그래프 (40점 만점 축).
 * 막대 높이 = 정답률 × 40 — 평일(total=40)은 원점수와 동일, 금요일(가변 total)은 40점으로 환산해
 * 요일 간 성취도가 공정하게 비교된다. 막대 라벨·표에는 실제 score/total 을 그대로 노출한다.
 */
function VocabScoreChart({ data }: { data: VocabExamReportData }) {
  const rows = data.rows;
  if (rows.length === 0) return null;

  const vbW = 360;
  const vbH = 180;
  const padL = 30;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const chartW = vbW - padL - padR;
  const chartH = vbH - padT - padB;

  const n = rows.length;
  const gap = 10;
  const barW = Math.min(40, (chartW - gap * (n - 1)) / n);
  const groupW = (chartW - barW * n) / Math.max(1, n - 1 || 1);

  // 0 / 10 / 20 / 30 / 40 눈금
  const gridRatios = [0, 0.25, 0.5, 0.75, 1];
  // 40점 환산 점수(0~40)를 y좌표로. Math.min 은 부동소수 오차 방어용.
  const getY = (scaled: number) =>
    padT + chartH - (Math.min(scaled, MAX_SCORE) / MAX_SCORE) * chartH;

  return (
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
              {Math.round(MAX_SCORE * ratio)}
            </text>
          </g>
        );
      })}

      {rows.map((r, i) => {
        // 정답률을 40점으로 환산한 높이(평일은 원점수와 동일). total=0 방어.
        const scaled = r.total > 0 ? (r.score / r.total) * MAX_SCORE : 0;
        const x = padL + i * (barW + (n > 1 ? groupW : 0));
        const y = getY(scaled);
        const h = padT + chartH - y;
        return (
          <g key={`${r.weekday}-${i}`}>
            <rect x={x} y={y} width={barW} height={Math.max(0, h)} rx='3' fill={BAR_COLOR} />
            <text
              x={x + barW / 2}
              y={y - 4}
              textAnchor='middle'
              fontSize='8'
              fill='#6b7280'
              fontWeight='600'
            >
              {r.score}/{r.total}
            </text>
            <text x={x + barW / 2} y={vbH - 8} textAnchor='middle' fontSize='9' fill='#6b7280'>
              {r.weekday}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function VocabScoreCard({ data }: VocabScoreCardProps) {
  const rows = data.rows;

  return (
    <Card>
      <CardHeader className='pb-2'>
        <h3 className='text-text text-lg font-semibold'>영단어 테스트</h3>
        <p className='text-text-muted text-xs'>요일별 영단어 테스트 결과 (40점 만점)</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className='text-text-muted py-6 text-center text-sm'>
            이번 주 영단어 테스트 기록이 없습니다.
          </p>
        ) : (
          <div className='space-y-4'>
            <VocabScoreChart data={data} />
            <div className='overflow-hidden rounded-2xl border border-gray-200'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-text-muted bg-gray-50 text-xs'>
                    <th className='px-3 py-2 text-left font-medium'>요일</th>
                    <th className='px-3 py-2 text-left font-medium'>레벨</th>
                    <th className='px-3 py-2 text-right font-medium'>점수</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.weekday}-${i}`} className='border-t border-gray-100'>
                      <td className='text-text px-3 py-2'>{r.weekday}</td>
                      <td
                        className='text-text max-w-[10rem] truncate px-3 py-2'
                        title={r.levelLabel}
                      >
                        {r.levelLabel}
                      </td>
                      <td className='text-text px-3 py-2 text-right font-medium'>
                        {r.score} / {r.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
