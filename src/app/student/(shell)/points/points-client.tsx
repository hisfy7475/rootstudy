'use client';

import { useState, useTransition } from 'react';
import { PointsList } from '@/components/student/points-list';
import { Card } from '@/components/ui/card';
import { Award, TrendingDown, Filter, Gift, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { requestRedemption } from '@/lib/actions/student';
import { useRouter } from 'next/navigation';
import { PolicyHelpButton } from '@/components/policy/policy-acknowledgement-modal';

interface PointRecord {
  id: string;
  type: 'reward' | 'penalty';
  amount: number;
  reason: string;
  isAuto: boolean;
  createdAt: string;
  eventKind?: string;
}

interface PointsSummary {
  reward: number;
  penalty: number;
  total: number;
  rewardBalance: number;
  rewardLifetime: number;
  rewardRedeemed: number;
  rewardBurnt: number;
  penaltyQuarter: number;
  penaltyThreshold: number;
  quarterStart: string | null;
  quarterEnd: string | null;
  withdrawalReviewAt: string | null;
  activeRedemptions: Array<{
    id: string;
    status: string;
    voucher_code: string | null;
    voucher_amount: number | null;
    requested_at: string;
    issued_at: string | null;
  }>;
}

export interface PointRuleRow {
  reason: string;
  amount: number;
}

interface PointsPageClientProps {
  points: PointRecord[];
  summary: PointsSummary;
  rewardPresets: PointRuleRow[];
  penaltyPresets: PointRuleRow[];
}

type FilterType = 'all' | 'reward' | 'penalty';

export function PointsPageClient({
  points,
  summary,
  rewardPresets,
  penaltyPresets,
}: PointsPageClientProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [requesting, startRequest] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  const filteredPoints = filter === 'all' ? points : points.filter((p) => p.type === filter);

  const filterButtons: { value: FilterType; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'reward', label: '상점' },
    { value: 'penalty', label: '벌점' },
  ];

  // 분기 D-Day 계산
  const quarterEndStr = summary.quarterEnd;
  let dDay: number | null = null;
  if (quarterEndStr) {
    const end = new Date(quarterEndStr);
    const now = new Date();
    dDay = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
  }
  const quarterEndLabel = quarterEndStr
    ? new Date(quarterEndStr).toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const balance = summary.rewardBalance;
  const queueCount = summary.activeRedemptions.filter(
    (r) => r.status === 'requested' || r.status === 'auto_pending',
  ).length;
  const availableBalance = Math.max(0, balance - queueCount * 100);
  const redeemableSlots = Math.floor(availableBalance / 100);
  const progressInCycle = availableBalance % 100;
  const inReview = summary.withdrawalReviewAt !== null;

  const handleRequestRedemption = () => {
    setFeedback(null);
    startRequest(async () => {
      const res = await requestRedemption();
      if ('error' in res) {
        setFeedback(res.error);
        return;
      }
      setFeedback('상품권 신청이 접수되었습니다. 영업일 기준 3일 이내 발급됩니다.');
      router.refresh();
    });
  };

  return (
    <div className='space-y-6 p-4'>
      {/* 헤더 */}
      <div className='flex items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <div className='bg-primary/10 flex h-12 w-12 items-center justify-center rounded-2xl'>
            <Award className='text-primary h-6 w-6' />
          </div>
          <div>
            <h1 className='text-text text-xl font-bold'>상벌점 내역</h1>
            <p className='text-text-muted text-sm'>나의 상점과 벌점 기록</p>
          </div>
        </div>
        <PolicyHelpButton />
      </div>

      {/* 퇴원 검토 경고 배너 */}
      {inReview && (
        <Card className='border-red-200 bg-red-50 p-4'>
          <div className='flex items-start gap-3'>
            <AlertTriangle className='mt-0.5 h-5 w-5 flex-shrink-0 text-red-500' />
            <div className='space-y-1'>
              <p className='text-sm font-bold text-red-700'>원장님과 면담이 필요합니다</p>
              <p className='text-xs text-red-600'>
                분기 벌점 30점에 도달하여 검토 대상이 되었습니다. 잠시 후 안내해 드릴게요.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 누적 점수 — 2개 카드로 축소 */}
      <div className='grid grid-cols-2 gap-3'>
        {/* 상점 카드 + 진행도 바 */}
        <Card className='p-4'>
          <div className='mb-2 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-green-100'>
                <Award className='h-5 w-5 text-green-600' />
              </div>
              <p className='text-text-muted text-xs'>사용 가능 상점</p>
            </div>
            <p className='text-2xl font-bold text-green-600'>{balance}</p>
          </div>
          {/* 100점 단위 진행도 */}
          <div className='space-y-1'>
            <div className='text-text-muted flex items-center justify-between text-[10px]'>
              <span>
                {redeemableSlots > 0 ? `상품권 ${redeemableSlots}회 발급 가능` : '다음 상품권까지'}
              </span>
              <span>{progressInCycle} / 100</span>
            </div>
            <div className='h-1.5 w-full overflow-hidden rounded-full bg-green-100'>
              <div
                className='h-full rounded-full bg-green-500 transition-all'
                style={{ width: `${progressInCycle}%` }}
              />
            </div>
          </div>
          <p className='text-text-muted mt-2 text-[10px]'>
            획득 {summary.rewardLifetime} · 사용 {summary.rewardRedeemed}
            {summary.rewardBurnt > 0 ? ` · 소멸 ${summary.rewardBurnt}` : ''}
          </p>
        </Card>

        {/* 벌점 카드 — 분기 누적 */}
        <Card
          className={cn(
            'p-4',
            summary.penaltyQuarter >= 25
              ? 'border-red-200 bg-red-50'
              : summary.penaltyQuarter >= 10
                ? 'bg-orange-50'
                : '',
          )}
        >
          <div className='mb-2 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <div className='flex h-9 w-9 items-center justify-center rounded-xl bg-red-100'>
                <TrendingDown className='h-5 w-5 text-red-500' />
              </div>
              <p className='text-text-muted text-xs'>이번 분기 벌점</p>
            </div>
            <p
              className={cn(
                'text-2xl font-bold',
                summary.penaltyQuarter >= 25 ? 'text-red-600' : 'text-text',
              )}
            >
              {summary.penaltyQuarter}
              <span className='text-text-muted text-sm'>/{summary.penaltyThreshold}</span>
            </p>
          </div>
          <div className='space-y-1'>
            <div className='h-1.5 w-full overflow-hidden rounded-full bg-red-100'>
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  summary.penaltyQuarter >= 25 ? 'bg-red-500' : 'bg-orange-400',
                )}
                style={{
                  width: `${Math.min(
                    100,
                    (summary.penaltyQuarter / summary.penaltyThreshold) * 100,
                  )}%`,
                }}
              />
            </div>
            <p className='text-text-muted text-[10px]'>
              {quarterEndLabel ? `${quarterEndLabel}까지 D-${dDay}` : ''}
            </p>
          </div>
          {/* 25점 이상 사전 경고 */}
          {summary.penaltyQuarter >= 20 && balance > 0 && !inReview && (
            <p className='mt-2 text-[10px] font-medium text-red-600'>
              ⚠ 30점 도달 시 보유 상점 {balance}점 소멸
            </p>
          )}
        </Card>
      </div>

      {/* 상품권 신청 CTA — 가용 잔액 ≥ 100 + 검토 진입 아닐 때 */}
      {redeemableSlots > 0 && !inReview && (
        <button
          onClick={handleRequestRedemption}
          disabled={requesting}
          className='bg-primary hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50'
        >
          <Gift className='h-4 w-4' />
          {requesting ? '신청 중...' : `지금 상품권 신청 (${redeemableSlots}회 가능)`}
        </button>
      )}
      {feedback && (
        <p className='rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700'>{feedback}</p>
      )}

      {/* 활성 redemption 상태 */}
      {summary.activeRedemptions.length > 0 && (
        <Card className='border-purple-200 bg-purple-50 p-4'>
          <h3 className='mb-2 text-xs font-semibold text-purple-700'>상품권 신청 현황</h3>
          <div className='space-y-2'>
            {summary.activeRedemptions.map((r) => (
              <div key={r.id} className='flex items-center justify-between text-xs'>
                <div className='space-y-0.5'>
                  <p className='text-text'>
                    {r.status === 'requested' && '신청됨 (대기 중)'}
                    {r.status === 'auto_pending' && '자동 보호 (관리자 발급 대기)'}
                    {r.status === 'issued' && (
                      <>
                        발급 완료
                        {r.voucher_amount ? ` (${r.voucher_amount.toLocaleString()}원)` : ''}
                      </>
                    )}
                  </p>
                  {r.voucher_code && <p className='font-mono text-purple-700'>{r.voucher_code}</p>}
                </div>
                <p className='text-text-muted text-[10px]'>
                  {new Date(r.requested_at).toLocaleDateString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                  })}
                </p>
              </div>
            ))}
          </div>
          <p className='mt-2 flex items-center gap-1 text-[10px] text-purple-600'>
            <Info className='h-3 w-3' />
            영업일 기준 3일 이내 발급
          </p>
        </Card>
      )}

      {/* 필터 */}
      <div className='flex items-center gap-2'>
        <Filter className='text-text-muted h-4 w-4' />
        <div className='flex gap-2'>
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-all',
                filter === btn.value
                  ? 'bg-primary text-white'
                  : 'text-text-muted bg-gray-100 hover:bg-gray-200',
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* 내역 목록 */}
      <PointsList points={filteredPoints} />

      {/* 상·벌점 규정 (지점 프리셋) */}
      <section className='space-y-4 pt-2'>
        <h2 className='text-text text-sm font-semibold'>상벌점 규정</h2>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          {/* 상점 규정 */}
          <Card className='overflow-hidden border-green-200/80 bg-green-50/50 p-0'>
            <div className='border-b border-green-200/80 bg-green-100/60 px-4 py-3'>
              <h3 className='text-sm font-bold text-green-800'>상점 규정</h3>
            </div>
            <div className='divide-y divide-green-100'>
              <div className='grid grid-cols-[1fr_auto] gap-2 px-4 py-2 text-xs font-medium text-green-900/80'>
                <span>상점 규정</span>
                <span className='text-right'>상점</span>
              </div>
              {rewardPresets.length === 0 ? (
                <p className='text-text-muted px-4 py-6 text-center text-sm'>
                  등록된 항목이 없습니다
                </p>
              ) : (
                rewardPresets.map((row, i) => (
                  <div
                    key={`r-${i}-${row.reason}`}
                    className='grid grid-cols-[1fr_auto] gap-2 px-4 py-3 text-sm'
                  >
                    <span className='text-text'>{row.reason}</span>
                    <span className='text-right font-semibold text-green-700'>{row.amount}점</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* 벌점 규정 */}
          <Card className='overflow-hidden border-red-200/80 bg-red-50/50 p-0'>
            <div className='border-b border-red-200/80 bg-red-100/60 px-4 py-3'>
              <h3 className='text-sm font-bold text-red-800'>벌점 규정</h3>
            </div>
            <div className='divide-y divide-red-100'>
              <div className='grid grid-cols-[1fr_auto] gap-2 px-4 py-2 text-xs font-medium text-red-900/80'>
                <span>벌점 규정</span>
                <span className='text-right'>벌점</span>
              </div>
              {penaltyPresets.length === 0 ? (
                <p className='text-text-muted px-4 py-6 text-center text-sm'>
                  등록된 항목이 없습니다
                </p>
              ) : (
                penaltyPresets.map((row, i) => (
                  <div
                    key={`p-${i}-${row.reason}`}
                    className='grid grid-cols-[1fr_auto] gap-2 px-4 py-3 text-sm'
                  >
                    <span className='text-text'>{row.reason}</span>
                    <span className='text-right font-semibold text-red-600'>{row.amount}점</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
        <p className='text-text-muted flex items-start gap-2 rounded-xl bg-gray-100/80 px-3 py-2.5 text-xs'>
          <span aria-hidden className='shrink-0'>
            ⚠
          </span>
          해당 상벌점은 사유에 따라 벌점의 부과 여부가 결정됩니다.
        </p>
      </section>
    </div>
  );
}
