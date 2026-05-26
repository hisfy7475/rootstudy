'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, UserX, RotateCcw } from 'lucide-react';
import { confirmWithdrawal, cancelWithdrawalReviewAction } from '@/lib/actions/admin';

interface ReviewQueueRow {
  studentId: string;
  name: string;
  seatNumber: number | null;
  reviewAt: string | null;
  reviewReason: string | null;
  consumedAt: string | null;
  penaltyQuarter: number;
  lastPenalty: { reason: string; amount: number; createdAt: string } | null;
  protectedRedemptionCount: number;
}

interface Props {
  queue: ReviewQueueRow[];
  onRefresh: () => void;
}

type Confirm =
  | null
  | { type: 'withdraw'; row: ReviewQueueRow }
  | { type: 'cancel_with_restore'; row: ReviewQueueRow }
  | { type: 'cancel_no_restore'; row: ReviewQueueRow };

export function WithdrawalReviewTab({ queue, onRefresh }: Props) {
  const [busy, startBusy] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handle = (action: Exclude<Confirm, null>) => {
    setFeedback(null);
    startBusy(async () => {
      let res: { success?: boolean; error?: string; warning?: string; restoredReward?: number };
      if (action.type === 'withdraw') {
        res = await confirmWithdrawal(action.row.studentId);
      } else if (action.type === 'cancel_with_restore') {
        res = await cancelWithdrawalReviewAction(action.row.studentId, true);
      } else {
        res = await cancelWithdrawalReviewAction(action.row.studentId, false);
      }
      setConfirm(null);
      if (res.error) {
        setFeedback(`실패: ${res.error}`);
      } else {
        const restoreMsg =
          'restoredReward' in res && res.restoredReward
            ? ` (상점 ${res.restoredReward}점 복구)`
            : '';
        setFeedback(`처리 완료${restoreMsg}`);
      }
      onRefresh();
    });
  };

  if (queue.length === 0) {
    return (
      <Card className='p-8 text-center'>
        <p className='text-text-muted text-sm'>현재 퇴원 검토 대기 학생이 없습니다.</p>
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      {feedback && (
        <Card className='border-blue-200 bg-blue-50 p-3 text-sm text-blue-700'>{feedback}</Card>
      )}
      <Card className='overflow-hidden'>
        <div className='border-b bg-red-50 px-4 py-3'>
          <h2 className='flex items-center gap-2 text-sm font-bold text-red-700'>
            <AlertTriangle className='h-4 w-4' />
            퇴원 검토 대기 ({queue.length}명)
          </h2>
          <p className='text-text-muted mt-1 text-xs'>
            벌점 30점 도달로 검토 대상이 된 학생입니다. 면담 후 개별 처리해주세요.
          </p>
        </div>
        <div className='divide-y'>
          {queue.map((row) => (
            <div key={row.studentId} className='space-y-2 p-4'>
              <div className='flex items-center justify-between'>
                <div className='space-y-1'>
                  <p className='font-semibold'>
                    {row.name}
                    {row.seatNumber !== null && (
                      <span className='text-text-muted ml-2 text-xs font-normal'>
                        ({row.seatNumber}번)
                      </span>
                    )}
                  </p>
                  <p className='text-text-muted text-xs'>
                    검토 진입{' '}
                    {row.reviewAt
                      ? new Date(row.reviewAt).toLocaleDateString('ko-KR', {
                          timeZone: 'Asia/Seoul',
                        })
                      : '-'}
                    {' · '}
                    분기 벌점 <strong className='text-red-600'>{row.penaltyQuarter}점</strong>
                    {row.protectedRedemptionCount > 0 && (
                      <>
                        {' · '}
                        보호된 발급 대기{' '}
                        <strong className='text-purple-600'>
                          {row.protectedRedemptionCount}건
                        </strong>
                      </>
                    )}
                  </p>
                  {row.lastPenalty && (
                    <p className='text-text-muted text-xs'>
                      최근 벌점: {row.lastPenalty.reason} (-{row.lastPenalty.amount}점,{' '}
                      {new Date(row.lastPenalty.createdAt).toLocaleDateString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                      })}
                      )
                    </p>
                  )}
                </div>
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => setConfirm({ type: 'cancel_with_restore', row })}
                  >
                    <RotateCcw className='mr-1 h-3.5 w-3.5' />
                    검토 취소 (상점 복구)
                  </Button>
                  <Button
                    size='sm'
                    variant='danger'
                    disabled={busy}
                    onClick={() => setConfirm({ type: 'withdraw', row })}
                  >
                    <UserX className='mr-1 h-3.5 w-3.5' />
                    확정 퇴원
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Confirm 다이얼로그 */}
      {confirm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <Card className='w-full max-w-md p-6'>
            <h3 className='mb-2 text-lg font-bold'>
              {confirm.type === 'withdraw' && '퇴원 확정'}
              {confirm.type === 'cancel_with_restore' && '검토 취소 (상점 복구)'}
              {confirm.type === 'cancel_no_restore' && '검토 취소 (복구 없음)'}
            </h3>
            <p className='text-text-muted mb-4 text-sm'>
              {confirm.type === 'withdraw' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생을 확정 퇴원
                  처리합니다. 이 작업은 되돌릴 수 없습니다.
                </>
              )}
              {confirm.type === 'cancel_with_restore' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생의 검토 상태를
                  취소하고, 이번 분기에 소멸된 상점을 복구합니다.
                </>
              )}
              {confirm.type === 'cancel_no_restore' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생의 검토 상태만
                  취소합니다. 소멸된 상점은 복구되지 않습니다.
                </>
              )}
            </p>
            <div className='flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setConfirm(null)} disabled={busy}>
                취소
              </Button>
              <Button
                variant={confirm.type === 'withdraw' ? 'danger' : 'default'}
                onClick={() => handle(confirm)}
                disabled={busy}
              >
                {busy ? '처리 중...' : '확인'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
