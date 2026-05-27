'use client';

import { Card } from '@/components/ui/card';
import { Award, TrendingDown, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParentPointsCardData {
  penaltyQuarter?: number; // net
  penaltyQuarterRaw?: number;
  penaltyOffsetInQuarter?: number;
  penaltyThreshold?: number;
  quarterEnd?: string | null;
  withdrawalReviewAt?: string | null;
  withdrawalRequiredAt?: string | null;
  rewardBalance?: number;
}

/** 단계 7: 학부모 대시보드 자녀 카드 내 분기 누적 벌점·상점 잔액 표시 */
export function ParentPointsCard({ data }: { data: ParentPointsCardData }) {
  const penaltyQuarter = data.penaltyQuarter ?? 0;
  const penaltyOffsetInQuarter = data.penaltyOffsetInQuarter ?? 0;
  const penaltyQuarterRaw = data.penaltyQuarterRaw ?? penaltyQuarter + penaltyOffsetInQuarter;
  const threshold = data.penaltyThreshold ?? 30;
  const balance = data.rewardBalance ?? 0;
  const inReview = !!data.withdrawalReviewAt;
  const inRequired = !!data.withdrawalRequiredAt;

  let dDay: number | null = null;
  let quarterEndLabel = '';
  if (data.quarterEnd) {
    const end = new Date(data.quarterEnd);
    const now = new Date();
    dDay = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
    quarterEndLabel = end.toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'long',
      day: 'numeric',
    });
  }

  return (
    <div className='space-y-3'>
      {inRequired && (
        <Card className='border-red-300 bg-red-100 p-3'>
          <div className='flex items-start gap-2'>
            <AlertTriangle className='mt-0.5 h-4 w-4 flex-shrink-0 text-red-700' />
            <div className='space-y-0.5'>
              <p className='text-sm font-bold text-red-800'>강제 퇴원 대상으로 분류되었습니다</p>
              <p className='text-xs text-red-700'>
                자녀가 벌점 30점 도달 시점에 가용 상점이 없어 강제 퇴원 대상이 되었습니다.
              </p>
            </div>
          </div>
        </Card>
      )}
      {inReview && !inRequired && (
        <Card className='border-red-200 bg-red-50 p-3'>
          <div className='flex items-start gap-2'>
            <AlertTriangle className='mt-0.5 h-4 w-4 flex-shrink-0 text-red-600' />
            <div className='space-y-0.5'>
              <p className='text-sm font-bold text-red-700'>퇴원 검토 대상으로 분류되었습니다</p>
              <p className='text-xs text-red-600'>
                {penaltyOffsetInQuarter > 0
                  ? `자녀가 벌점 30점에 도달하여 상점 ${penaltyOffsetInQuarter}점과 상계되었습니다. 잔존 벌점 ${penaltyQuarter}점.`
                  : '자녀가 분기 벌점 30점에 도달하여 퇴원 검토 대상이 되었습니다.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className='grid grid-cols-2 gap-3'>
        {/* 상점 잔액 */}
        <Card className='p-3'>
          <div className='mb-1 flex items-center gap-2'>
            <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-green-100'>
              <Award className='h-4 w-4 text-green-600' />
            </div>
            <p className='text-text-muted text-xs'>상점 잔액</p>
          </div>
          <p className='text-xl font-bold text-green-600'>{balance}</p>
        </Card>

        {/* 분기 벌점 */}
        <Card
          className={cn(
            'p-3',
            penaltyQuarter >= 25
              ? 'border-red-200 bg-red-50'
              : penaltyQuarter >= 10
                ? 'bg-orange-50'
                : '',
          )}
        >
          <div className='mb-1 flex items-center gap-2'>
            <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-red-100'>
              <TrendingDown className='h-4 w-4 text-red-500' />
            </div>
            <p className='text-text-muted text-xs'>분기 벌점</p>
          </div>
          <p
            className={cn('text-xl font-bold', penaltyQuarter >= 25 ? 'text-red-600' : 'text-text')}
          >
            {penaltyQuarter}
            <span className='text-text-muted text-xs'>/{threshold}</span>
          </p>
          {penaltyOffsetInQuarter > 0 && (
            <p className='text-text-muted text-[10px]'>
              원본 {penaltyQuarterRaw} − 상계 {penaltyOffsetInQuarter}
            </p>
          )}
          {quarterEndLabel && (
            <p className='text-text-muted text-[10px]'>
              {quarterEndLabel} 초기화 (D-{dDay})
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
