'use client';

import { cn } from '@/lib/utils';
import { Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface FocusScoreDisplayProps {
  score: number | null;
  previousScore?: number | null;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 8) return 'text-green-600';
  if (score >= 6) return 'text-primary';
  if (score >= 4) return 'text-amber-500';
  return 'text-red-500';
}

function getScoreLabel(score: number): string {
  if (score >= 9) return '완전 몰입!';
  if (score >= 7) return '좋아요!';
  if (score >= 5) return '보통이에요';
  if (score >= 3) return '조금 힘들어요';
  return '집중이 어려워요';
}

function getScoreBgColor(score: number): string {
  if (score >= 8) return 'bg-green-100';
  if (score >= 6) return 'bg-primary/10';
  if (score >= 4) return 'bg-amber-100';
  return 'bg-red-100';
}

export function FocusScoreDisplay({ score, previousScore, className }: FocusScoreDisplayProps) {
  const trend = score && previousScore
    ? score > previousScore
      ? 'up'
      : score < previousScore
        ? 'down'
        : 'same'
    : null;

  return (
    <div className={cn('bg-card rounded-3xl p-6 shadow-sm', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text">오늘의 몰입도</h3>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
            trend === 'up' && 'bg-green-100 text-green-700',
            trend === 'down' && 'bg-red-100 text-red-600',
            trend === 'same' && 'bg-gray-100 text-gray-600'
          )}>
            {trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {trend === 'same' && <Minus className="w-3 h-3" />}
            {trend === 'up' ? '상승' : trend === 'down' ? '하락' : '유지'}
          </div>
        )}
      </div>

      {score !== null ? (
        <div className="flex items-center gap-4">
          {/* 점수 원형 표시 */}
          <div className={cn(
            'w-24 h-24 rounded-full flex items-center justify-center',
            getScoreBgColor(score)
          )}>
            <div className="text-center">
              <span className={cn('text-4xl font-bold', getScoreColor(score))}>
                {score}
              </span>
              <span className="text-sm text-text-muted">/10</span>
            </div>
          </div>

          {/* 점수 설명 */}
          <div className="flex-1">
            <p className={cn('text-lg font-semibold', getScoreColor(score))}>
              {getScoreLabel(score)}
            </p>
            <p className="text-sm text-text-muted mt-1">
              관리자가 측정한 오늘의 몰입도 점수입니다.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center">
            <Brain className="w-10 h-10 text-gray-300" />
          </div>
          <div>
            <p className="text-lg font-medium text-text-muted">
              아직 기록이 없어요
            </p>
            <p className="text-sm text-text-muted mt-1">
              관리자가 몰입도를 측정하면 여기에 표시됩니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
