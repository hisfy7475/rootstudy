'use client';

import { cn } from '@/lib/utils';
import { Award, AlertTriangle, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface PointRecord {
  id: string;
  type: 'reward' | 'penalty';
  amount: number;
  reason: string;
  isAuto: boolean;
  createdAt: string;
}

interface PointsListProps {
  points: PointRecord[];
  className?: string;
}

export function PointsList({ points, className }: PointsListProps) {
  if (points.length === 0) {
    return (
      <div className={cn('text-center py-12', className)}>
        <Award className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-text-muted">상벌점 내역이 없습니다</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {points.map((point) => (
        <div
          key={point.id}
          className={cn(
            'flex items-start gap-3 p-4 rounded-2xl',
            point.type === 'reward' ? 'bg-green-50' : 'bg-red-50'
          )}
        >
          {/* 아이콘 */}
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            point.type === 'reward' ? 'bg-green-100' : 'bg-red-100'
          )}>
            {point.type === 'reward' ? (
              <Award className="w-5 h-5 text-green-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-500" />
            )}
          </div>

          {/* 내용 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                'text-sm font-semibold',
                point.type === 'reward' ? 'text-green-700' : 'text-red-600'
              )}>
                {point.type === 'reward' ? '상점' : '벌점'} {point.amount}점
              </span>
              {point.isAuto && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary/10 rounded text-xs text-primary">
                  <Zap className="w-3 h-3" />
                  자동
                </span>
              )}
            </div>
            <p className="text-sm text-text">{point.reason}</p>
            <p className="text-xs text-text-muted mt-1">
              {format(new Date(point.createdAt), 'M월 d일 (EEE) HH:mm', { locale: ko })}
            </p>
          </div>

          {/* 점수 */}
          <div className={cn(
            'text-lg font-bold',
            point.type === 'reward' ? 'text-green-600' : 'text-red-500'
          )}>
            {point.type === 'reward' ? '+' : '-'}{point.amount}
          </div>
        </div>
      ))}
    </div>
  );
}
