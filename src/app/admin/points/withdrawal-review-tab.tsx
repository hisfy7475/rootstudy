'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, UserX, RotateCcw, ShieldAlert, Scale, Check, X } from 'lucide-react';
import {
  confirmWithdrawal,
  cancelWithdrawalReviewAction,
  notifyWithdrawalClassification,
  dismissWithdrawalClassification,
  undismissPenaltyThreshold,
} from '@/lib/actions/admin';

interface QueueRow {
  studentId: string;
  name: string;
  seatNumber: number | null;
  kind: 'review' | 'required' | 'notice_pending' | 'dismissed';
  reviewAt: string | null;
  reviewReason: string | null;
  consumedAt: string | null;
  requiredAt: string | null;
  requiredReason: string | null;
  notifiedAt?: string | null;
  dismissedAt?: string | null;
  dismissedReason?: string | null;
  dismissedNet?: number | null;
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
  /** 강제 퇴원 대상으로 분류됐으나 학생에게 아직 통보되지 않은 학생 */
  noticePendingQueue?: QueueRow[];
  /** 이번 분기에 처리하지 않기로 한 학생 — 되돌릴 수 있어야 하므로 노출 */
  dismissedQueue?: QueueRow[];
  onRefresh: () => void;
}

type Confirm =
  | null
  | { type: 'withdraw'; row: QueueRow }
  | { type: 'cancel_with_restore'; row: QueueRow }
  | { type: 'cancel_no_restore'; row: QueueRow }
  | { type: 'notify_student'; row: QueueRow }
  | { type: 'dismiss_classification'; row: QueueRow }
  | { type: 'undismiss_candidate'; row: QueueRow };

export function WithdrawalReviewTab({
  reviewQueue,
  requiredQueue,
  noticePendingQueue = [],
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
      } else if (action.type === 'notify_student') {
        res = await notifyWithdrawalClassification(action.row.studentId);
      } else if (action.type === 'dismiss_classification') {
        res = await dismissWithdrawalClassification(action.row.studentId);
      } else {
        res = await undismissPenaltyThreshold(action.row.studentId);
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
    noticePendingQueue.length === 0 &&
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
              : row.kind === 'dismissed'
                ? '분류 취소'
                : row.kind === 'notice_pending'
                  ? '자동 분류 (미통보)'
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
          {row.kind === 'notice_pending' && (
            <p className='rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800'>
              시스템이 자동으로 분류했고 <strong>학생에게는 아직 통보되지 않았습니다.</strong>{' '}
              통보하면 학생 앱에 안내 배너가 뜨고 푸시 알림이 발송됩니다. 오분류라면 통보 전에{' '}
              <strong>분류 취소</strong>를 눌러주세요.
            </p>
          )}
          {row.kind === 'dismissed' && (row.dismissedNet ?? 0) > 0 && (
            <p className='rounded-lg bg-gray-50 px-2 py-1.5 text-xs text-gray-700'>
              취소 시점 분기 벌점 <strong>{row.dismissedNet}점</strong>. 이 값을 넘어서면 다시
              분류됩니다(통보는 별도 조작).
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
              분류 복원
            </Button>
          ) : row.kind === 'notice_pending' ? (
            <>
              <Button
                size='sm'
                variant='outline'
                disabled={busy}
                onClick={() => setConfirm({ type: 'dismiss_classification', row })}
              >
                <X className='mr-1 h-3.5 w-3.5' />
                분류 취소
              </Button>
              <Button
                size='sm'
                variant='danger'
                disabled={busy}
                onClick={() => setConfirm({ type: 'notify_student', row })}
              >
                <Check className='mr-1 h-3.5 w-3.5' />
                학생에게 통보
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
                onClick={() => setConfirm({ type: 'dismiss_classification', row })}
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

      {noticePendingQueue.length > 0 && (
        <Card className='overflow-hidden'>
          <div className='border-b bg-amber-100 px-4 py-3'>
            <h2 className='flex items-center gap-2 text-sm font-bold text-amber-900'>
              <Scale className='h-4 w-4' />
              통보 대기 — 강제 퇴원 자동 분류 ({noticePendingQueue.length}명)
            </h2>
            <p className='text-text-muted mt-1 text-xs'>
              벌점 30점 도달로 <strong>시스템이 이미 강제 퇴원 대상으로 분류</strong>했지만,
              학생에게는 아직 통보되지 않은 상태입니다. 통보하면 학생 앱에 안내 배너가 뜨고 푸시
              알림이 발송됩니다. 오분류라면 통보 전에 분류 취소를 눌러주세요.
            </p>
          </div>
          <div className='divide-y'>{noticePendingQueue.map(renderRow)}</div>
        </Card>
      )}

      {dismissedQueue.length > 0 && (
        <Card className='overflow-hidden'>
          <div className='border-b bg-gray-100 px-4 py-3'>
            <h2 className='flex items-center gap-2 text-sm font-bold text-gray-700'>
              <X className='h-4 w-4' />
              분류 취소됨 — 이번 분기 ({dismissedQueue.length}명)
            </h2>
            <p className='text-text-muted mt-1 text-xs'>
              관리자가 강제 퇴원 분류를 취소한 학생입니다. 취소 시점의 분기 벌점을 넘어설 때까지는
              다시 분류되지 않습니다(다음 분기에 자동 해제). 판단을 번복하려면 분류 복원을 누르세요.
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
              벌점 30점 도달 시점에 상계로 벌점을 30점 미만으로 낮출 수 없어 자동 분류된
              학생입니다(상계는 재원 중 1회). 강제 퇴원은 되돌릴 수 없으니 신중히 처리하세요.
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
              {confirm.type === 'notify_student' && '학생에게 통보'}
              {confirm.type === 'dismiss_classification' && '강제 퇴원 분류 취소'}
              {confirm.type === 'undismiss_candidate' && '분류 복원'}
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
              {confirm.type === 'notify_student' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생에게 강제 퇴원 대상
                  분류를 통보합니다. 학생 앱에 안내 배너가 뜨고{' '}
                  <strong className='text-red-600'>푸시 알림이 즉시 발송</strong>됩니다. 학부모
                  대시보드에도 표시됩니다.
                </>
              )}
              {confirm.type === 'dismiss_classification' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생의 강제 퇴원 대상
                  분류를 취소합니다. 벌점과 상점은 그대로 유지되고, 분류 때문에 멈춰 있던 상품권
                  자동 발급이 복구됩니다. 취소 시점의 분기 벌점({confirm.row.penaltyQuarter}점)을
                  넘어서기 전까지는 다시 분류되지 않습니다.
                  {confirm.row.notifiedAt
                    ? ' 이 학생에게는 이미 통보된 상태이며, 학생 앱의 안내 배너는 즉시 사라집니다.'
                    : ' 학생에게는 통보되지 않았으므로 아무것도 모릅니다.'}
                </>
              )}
              {confirm.type === 'undismiss_candidate' && (
                <>
                  <strong className='text-text'>{confirm.row.name}</strong> 학생의 분류 취소를
                  되돌립니다. 분기 벌점이 여전히 30점 이상이면 즉시 다시 분류됩니다. 이것만으로는
                  학생에게 통보되지 않습니다.
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
