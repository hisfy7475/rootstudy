'use client';

import { cn } from '@/lib/utils';
import { Award, AlertTriangle, Zap, Gift, Flame, RotateCcw, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface PointRecord {
  id: string;
  type: 'reward' | 'penalty';
  amount: number;
  reason: string;
  isAuto: boolean;
  createdAt: string;
  eventKind?: string;
}

interface PointsListProps {
  points: PointRecord[];
  className?: string;
}

// event_kind 별 시각 차별화
function getEventVisual(point: PointRecord): {
  icon: React.ReactNode;
  bgRow: string;
  bgIcon: string;
  labelText: string;
  labelColor: string;
  amountColor: string;
  amountPrefix: string;
} {
  const kind = point.eventKind;
  // 상점 차감 (소멸/발급/취소)
  if (kind === 'redeem') {
    return {
      icon: <Gift className='h-5 w-5 text-purple-600' />,
      bgRow: 'bg-purple-50',
      bgIcon: 'bg-purple-100',
      labelText: '상품권 발급',
      labelColor: 'text-purple-700',
      amountColor: 'text-purple-600',
      amountPrefix: '',
    };
  }
  if (kind === 'reset_on_threshold') {
    return {
      icon: <Flame className='h-5 w-5 text-red-600' />,
      bgRow: 'bg-red-50',
      bgIcon: 'bg-red-100',
      labelText: '상점 소멸',
      labelColor: 'text-red-700',
      amountColor: 'text-red-600',
      amountPrefix: '',
    };
  }
  if (kind === 'reset_on_threshold_revert') {
    return {
      icon: <RotateCcw className='h-5 w-5 text-emerald-600' />,
      bgRow: 'bg-emerald-50',
      bgIcon: 'bg-emerald-100',
      labelText: '상점 복구',
      labelColor: 'text-emerald-700',
      amountColor: 'text-emerald-600',
      amountPrefix: '+',
    };
  }
  if (kind === 'manual_cancel') {
    return {
      icon: <Ban className='h-5 w-5 text-gray-500' />,
      bgRow: 'bg-gray-50',
      bgIcon: 'bg-gray-100',
      labelText: '취소',
      labelColor: 'text-gray-600',
      amountColor: 'text-gray-500',
      amountPrefix: point.amount >= 0 ? '+' : '',
    };
  }
  // 기본 (manual / auto_weekly / auto_daily_focus / auto_late / auto_early)
  if (point.type === 'reward') {
    return {
      icon: <Award className='h-5 w-5 text-green-600' />,
      bgRow: 'bg-green-50',
      bgIcon: 'bg-green-100',
      labelText: '상점',
      labelColor: 'text-green-700',
      amountColor: 'text-green-600',
      amountPrefix: '+',
    };
  }
  return {
    icon: <AlertTriangle className='h-5 w-5 text-red-500' />,
    bgRow: 'bg-red-50',
    bgIcon: 'bg-red-100',
    labelText: '벌점',
    labelColor: 'text-red-600',
    amountColor: 'text-red-500',
    amountPrefix: '-',
  };
}

export function PointsList({ points, className }: PointsListProps) {
  if (points.length === 0) {
    return (
      <div className={cn('py-12 text-center', className)}>
        <Award className='mx-auto mb-3 h-12 w-12 text-gray-200' />
        <p className='text-text-muted'>상벌점 내역이 없습니다</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {points.map((point) => {
        const v = getEventVisual(point);
        const displayAmount = Math.abs(point.amount);
        return (
          <div key={point.id} className={cn('flex items-start gap-3 rounded-2xl p-4', v.bgRow)}>
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                v.bgIcon,
              )}
            >
              {v.icon}
            </div>

            <div className='min-w-0 flex-1'>
              <div className='mb-1 flex items-center gap-2'>
                <span className={cn('text-sm font-semibold', v.labelColor)}>
                  {v.labelText} {displayAmount}점
                </span>
                {point.isAuto && (
                  <span className='bg-primary/10 text-primary inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs'>
                    <Zap className='h-3 w-3' />
                    자동
                  </span>
                )}
              </div>
              <p className='text-text text-sm'>{point.reason}</p>
              <p className='text-text-muted mt-1 text-xs'>
                {format(new Date(point.createdAt), 'M월 d일 (EEE) HH:mm', { locale: ko })}
              </p>
            </div>

            <div className={cn('text-lg font-bold', v.amountColor)}>
              {v.amountPrefix}
              {displayAmount}
            </div>
          </div>
        );
      })}
    </div>
  );
}
