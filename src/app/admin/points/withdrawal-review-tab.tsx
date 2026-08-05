'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, UserX, RotateCcw, ShieldAlert, Scale, Check, X } from 'lucide-react';
import {
  confirmWithdrawal,
  cancelWithdrawalReviewAction,
  cancelRequiredWithdrawal,
  approvePenaltyThreshold,
  dismissPenaltyThreshold,
  undismissPenaltyThreshold,
} from '@/lib/actions/admin';

interface QueueRow {
  studentId: string;
  name: string;
  seatNumber: number | null;
  kind: 'review' | 'required' | 'candidate' | 'dismissed';
  reviewAt: string | null;
  reviewReason: string | null;
  consumedAt: string | null;
  requiredAt: string | null;
  requiredReason: string | null;
  candidateAt?: string | null;
  candidateReason?: string | null;
  candidateNet?: number | null;
  candidateAvailableReward?: number | null;
  candidateOffsetConsumed?: boolean | null;
  dismissedAt?: string | null;
  dismissedReason?: string | null;
  markedAt: string | null;
  markedReason: string | null;
  penaltyQuarter: number;
  penaltyQuarterRaw: number;
  penaltyOffsetInQuarter: number;
  lastPenalty: { reason: string; amount: number; createdAt: string } | null;
  protectedRedemptionCount: number;
}

interface Props {
  reviewQueue: QueueRow[];
  requiredQueue: QueueRow[];
  /** 30점 도달 감지 — 아직 학생에게 통보되지 않은 승인 대기 학생 */
  candidateQueue?: QueueRow[];
  /** 이번 분기에 처리하지 않기로 한 학생 — 되돌릴 수 있어야 하므로 노출 */
  dismissedQueue?: QueueRow[];
  onRefresh: () => void;
}

type Confirm =
  | null
  | { type: 'withdraw'; row: QueueRow }
  | { type: 'cancel_with_restore'; row: QueueRow }
  | { type: 'cancel_no_restore'; row: QueueRow }
  | { type: 'cancel_required'; row: QueueRow }
  | { type: 'approve_candidate'; row: QueueRow }
  | { type: 'dismiss_candidate'; row: QueueRow }
  | { type: 'undismiss_candidate'; row: QueueRow };

export function WithdrawalReviewTab({
  reviewQueue,
  requiredQueue,
  candidateQueue = [],
  dismissedQueue = [],
  onRefresh,
}: Props) {
  const [busy, startBusy] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handle = (action: Exclude<Confirm, null>) => {
    setFeedback(null);
    startBusy(async () => {
      let res: {
        success?: boolean;
        error?: string;
        warning?: string;
        message?: string;
        restoredReward?: number;
      };
      if (action.type === 'withdraw') {
        res = await confirmWithdrawal(action.row.studentId);
      } else if (action.type === 'cancel_with_restore') {
        res = await cancelWithdrawalReviewAction(action.row.studentId, true);
      } else if (action.type === 'cancel_no_restore') {
        res = await cancelWithdrawalReviewAction(action.row.studentId, false);
      } else if (action.type === 'approve_candidate') {
        res = await approvePenaltyThreshold(action.row.studentId);
      } else if (action.type === 'dismiss_candidate') {
        res = await dismissPenaltyThreshold(action.row.studentId);
      } else if (action.type === 'undismiss_candidate') {
        res = await undismissPenaltyThreshold(action.row.studentId);
      } else {
        res = await cancelRequiredWithdrawal(action.row.studentId);
      }
      setConfirm(null);
      if (res.error) {
        setFeedback(`실패: ${res.error}`);
      } else if (res.message) {
        setFeedback(res.message);
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

  if (
    reviewQueue.length === 0 &&
    requiredQueue.length === 0 &&
    candidateQueue.length === 0 &&
    dismissedQueue.length === 0
  ) {
    return (
      <Card className='p-8 text-center'>
        <p className='text-text-muted text-sm'>현재 퇴원 검토/강제 퇴원 대상 학생이 없습니다.</p>
      </Card>
    );
  }

  const renderRow = (row: QueueRow) => (
    <div key={row.studentId} className='space-y-2 p-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='space-y-1'>
          <p className='font-semibold'>
            {row.name}
            {row.seatNumber !== null && (
              <span className='text-text-muted ml-2 text-xs font-normal'>({row.seatNumber}번)</span>
            )}
          </p>
          <p className='text-text-muted text-xs'>
            {row.kind === 'review'
              ? '검토 진입'
              : row.kind === 'candidate'
                ? '30점 도달 감지'
                : row.kind === 'dismissed'
                  ? '처리 제외'
                  : '강제 퇴원 대상 분류'}{' '}
            {row.markedAt
              ? new Date(row.markedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
              : '-'}
            {' · '}
            분기 벌점 (잔존) <strong className='text-red-600'>{row.penaltyQuarter}점</strong>
            {row.penaltyOffsetInQuarter > 0 && (
              <span className='text-text-muted'>
                {' '}
                / 원본 {row.penaltyQuarterRaw}점 − 상계 {row.penaltyOffsetInQuarter}점
              </span>
            )}
            {row.protectedRedemptionCount > 0 && (
              <>
                {' · '}
                보호된 발급 대기{' '}
                <strong className='text-purple-600'>{row.protectedRedemptionCount}건</strong>
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
          {row.markedReason && <p className='text-text-muted text-xs'>사유: {row.markedReason}</p>}
          {row.kind === 'candidate' && (
            <p className='rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800'>
              승인하면{' '}
              {row.candidateOffsetConsumed ? (
                <>
                  <strong>이번 분기 상계를 이미 사용</strong>했으므로 상계 없이{' '}
                  <strong>강제 퇴원 대상으로 분류</strong>되고 학생에게 통보됩니다.
                </>
              ) : (row.candidateAvailableReward ?? 0) > 0 ? (
                <>
                  가용 상점{' '}
                  <strong>
                    {Math.min(row.candidateAvailableReward ?? 0, row.penaltyQuarter)}점
                  </strong>
                  이 벌점과 상계되고, 이번 분기 상계 기회가 소진됩니다.
                </>
              ) : (
                <>
                  상계 가능한 상점이 없어 <strong>강제 퇴원 대상으로 분류</strong>되고 학생에게
                  통보됩니다.
                </>
              )}
              {(row.protectedRedemptionCount ?? 0) > 0 && (
                <>
                  {' '}
                  (상품권 발급 대기 {row.protectedRedemptionCount}건 = 상점{' '}
                  {row.protectedRedemptionCount * 100}점이 보호되어 가용에서 제외됨)
                </>
              )}
            </p>
          )}
        </div>
        <div className='flex flex-shrink-0 flex-wrap gap-2'>
          {row.kind === 'dismissed' ? (
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => setConfirm({ type: 'undismiss_candidate', row })}
            >
              <RotateCcw className='mr-1 h-3.5 w-3.5' />
              제외 취소
            </Button>
          ) : row.kind === 'candidate' ? (
            <>
              <Button
                size='sm'
                variant='outline'
                disabled={busy}
                onClick={() => setConfirm({ type: 'dismiss_candidate', row })}
              >
                <X className='mr-1 h-3.5 w-3.5' />
                제외
              </Button>
              <Button
                size='sm'
                variant='danger'
                disabled={busy}
                onClick={() => setConfirm({ type: 'approve_candidate', row })}
              >
                <Check className='mr-1 h-3.5 w-3.5' />
                승인
              </Button>
            </>
          ) : row.kind === 'review' ? (
            <>
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
            </>
          ) : (
            <>
              <Button
                size='sm'
                variant='outline'
                disabled={busy}
                onClick={() => setConfirm({ type: 'cancel_required', row })}
              >
                <RotateCcw className='mr-1 h-3.5 w-3.5' />
                분류 취소
              </Button>
              <Button
                size='sm'
                variant='danger'
                disabled={busy}
                onClick={() => setConfirm({ type: 'withdraw', row })}
              >
                <UserX className='mr-1 h-3.5 w-3.5' />
                강제 퇴원 실행
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className='space-y-4'>
      {feedback && (
        <Card className='border-blue-200 bg-blue-50 p-3 text-sm text-blue-700'>{feedback}</Card>
      )}

      {candidateQueue.length > 0 && (
        <Card className='overflow-hidden'>
          <div className='border-b bg-amber-100 px-4 py-3'>
            <h2 className='flex items-center gap-2 text-sm font-bold text-amber-900'>
              <Scale className='h-4 w-4' />
              승인 대기 — 벌점 30점 도달 ({candidateQueue.length}명)
            </h2>
            <p className='text-text-muted mt-1 text-xs'>
              시스템이 30점 도달을 감지했지만 <strong>아직 아무것도 실행하지 않은</strong>
              상태입니다. 학생에게는 통보되지 않았고 상점도 차감되지 않았습니다. 승인해야 상계 또는
              강제 퇴원 분류가 실행되고 그때 학생에게 통보됩니다.
            </p>
          </div>
          <div className='divide-y'>{candidateQueue.map(renderRow)}</div>
        </Card>
      )}

      {dismissedQueue.length > 0 && (
        <Card className='overflow-hidden'>
          <div className='border-b bg-gray-100 px-4 py-3'>
            <h2 className='flex items-center gap-2 text-sm font-bold text-gray-700'>
              <X className='h-4 w-4' />
              처리 제외 — 이번 분기 ({dismissedQueue.length}명)
            </h2>
            <p className='text-text-muted mt-1 text-xs'>
              관리자가 처리하지 않기로 결정한 학생입니다. 이번 분기에는 벌점이 더 쌓여도 승인 대기에
              다시 올라오지 않습니다(다음 분기에 자동 해제). 판단을 번복하려면 제외 취소를
              누르세요.
            </p>
          </div>
          <div className='divide-y'>{dismissedQueue.map(renderRow)}</div>
        </Card>
      )}

      {requiredQueue.length > 0 && (
        <Card className='overflow-hidden'>
          <div className='border-b bg-red-100 px-4 py-3'>
            <h2 className='flex items-center gap-2 text-sm font-bold text-red-800'>
              <ShieldAlert className='h-4 w-4' />
              강제 퇴원 대상 ({requiredQueue.length}명)
            </h2>
            <p className='text-text-muted mt-1 text-xs'>
              벌점 30점 도달 시점에 가용 상점이 없어 자동으로 분류된 학생입니다. 강제 퇴원은 되돌릴
              수 없으니 신중히 처리하세요.
            </p>
          </div>
          <div className='divide-y'>{requiredQueue.map(renderRow)}</div>
        </Card>
      )}

      {reviewQueue.length > 0 && (
        <Card className='overflow-hidden'>
          <div className='border-b bg-orange-50 px-4 py-3'>
            <h2 className='flex items-center gap-2 text-sm font-bold text-orange-700'>
              <AlertTriangle className='h-4 w-4' />
              퇴원 검토 대상 ({reviewQueue.length}명)
            </h2>
            <p className='text-text-muted mt-1 text-xs'>
              구 정책으로 검토 대상이 된 학생입니다 (상점 전액 소멸 후 검토 진입). 면담 후 개별
              처리해주세요.
            </p>
          </div>
          <div className='divide-y'>{reviewQueue.map(renderRow)}</div>
        </Card>
      )}

      {/* Confirm 다이얼로그 */}
      {confirm && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <Card className='w-full max-w-md p-6'>
            <h3 className='mb-2 text-lg font-bold'>
              {confirm.type === 'withdraw' &&
                (confirm.row.kind === 'required' ? '강제 퇴원 실행' : '퇴원 확정')}
              {confirm.type === 'cancel_with_restore' && '검토 취소 (상점 복구)'}
              {confirm.type === 'cancel_no_restore' && '검토 취소 (복구 없음)'}
              {confirm.type === 'cancel_required' && '강제 퇴원 대상 분류 취소'}
              {confirm.type === 'approve_candidate' && '30점 도달 처리 승인'}
              {confirm.type === 'dismiss_candidate' && '승인 대기에서 제외'}
              {confirm.type === 'undismiss_candidate' && '처리 제외 취소'}
            </h3>
            <p className='text-text-muted mb-4 text-sm'>
              {confirm.type === 'withdraw' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생을{' '}
                  {confirm.row.kind === 'required' ? '강제 퇴원' : '퇴원 확정'} 처리합니다. 이
                  작업은 되돌릴 수 없습니다.
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
              {confirm.type === 'cancel_required' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생의 강제 퇴원 대상
                  분류를 해제하여 재원 상태로 돌립니다. 이미 발생한 상계는 보존됩니다.
                </>
              )}
              {confirm.type === 'approve_candidate' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생의 벌점 30점 도달을
                  승인합니다.{' '}
                  {confirm.row.candidateOffsetConsumed ||
                  (confirm.row.candidateAvailableReward ?? 0) === 0 ? (
                    <>
                      <strong className='text-red-600'>강제 퇴원 대상으로 분류</strong>되며 학생
                      앱에 배너와 푸시 알림이 즉시 발송됩니다.
                    </>
                  ) : (
                    <>
                      보유 상점이 벌점과 상계되어 <strong>차감</strong>되고, 학생에게 상계 결과가
                      통보됩니다. 이번 분기 상계 기회는 소진됩니다.
                    </>
                  )}
                </>
              )}
              {confirm.type === 'dismiss_candidate' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생을 승인 대기
                  목록에서 제외합니다. 상계·강제 퇴원 어느 것도 실행되지 않고 학생에게도 통보되지
                  않습니다. 벌점과 상점은 그대로 유지됩니다.
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
