'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, X } from 'lucide-react';
import { issueRedemption, rejectRedemption } from '@/lib/actions/admin';

interface RedemptionQueueRow {
  id: string;
  student_id: string;
  status: string;
  points_used: number;
  voucher_amount: number | null;
  voucher_code: string | null;
  trigger: string;
  requested_at: string;
  profiles?: { name?: string; branch_id?: string } | { name?: string; branch_id?: string }[] | null;
}

interface Props {
  queue: RedemptionQueueRow[];
  onRefresh: () => void;
}

export function RedemptionQueueTab({ queue, onRefresh }: Props) {
  const [busy, startBusy] = useTransition();
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [voucherAmount, setVoucherAmount] = useState('10000');
  const [voucherCode, setVoucherCode] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const studentName = (row: RedemptionQueueRow): string => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return p?.name ?? '이름 없음';
  };

  const handleIssue = (row: RedemptionQueueRow) => {
    const amt = Number.parseInt(voucherAmount, 10);
    if (!amt || amt <= 0) {
      setFeedback('금액을 입력해주세요.');
      return;
    }
    if (!voucherCode.trim()) {
      setFeedback('상품권 코드를 입력해주세요.');
      return;
    }
    startBusy(async () => {
      const res = await issueRedemption({
        redemptionId: row.id,
        voucherAmount: amt,
        voucherCode: voucherCode.trim(),
      });
      setIssuingId(null);
      setVoucherCode('');
      if (res.error) {
        setFeedback(`발급 실패: ${res.error}`);
      } else {
        setFeedback(`${studentName(row)} 학생에게 발급 완료`);
      }
      onRefresh();
    });
  };

  const handleReject = (row: RedemptionQueueRow) => {
    if (!rejectReason.trim()) {
      setFeedback('거부 사유를 입력해주세요.');
      return;
    }
    startBusy(async () => {
      const res = await rejectRedemption({
        redemptionId: row.id,
        reason: rejectReason.trim(),
      });
      setRejectingId(null);
      setRejectReason('');
      if (res.error) {
        setFeedback(`거부 실패: ${res.error}`);
      } else {
        setFeedback('거부 처리 완료');
      }
      onRefresh();
    });
  };

  if (queue.length === 0) {
    return (
      <Card className='p-8 text-center'>
        <p className='text-text-muted text-sm'>대기 중인 상품권 신청이 없습니다.</p>
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      {feedback && (
        <Card className='border-blue-200 bg-blue-50 p-3 text-sm text-blue-700'>{feedback}</Card>
      )}
      <Card className='overflow-hidden'>
        <div className='border-b bg-purple-50 px-4 py-3'>
          <h2 className='flex items-center gap-2 text-sm font-bold text-purple-700'>
            <Gift className='h-4 w-4' />
            상품권 발급 대기 ({queue.length}건)
          </h2>
          <p className='text-text-muted mt-1 text-xs'>
            학생 직접 신청(requested) 또는 30점 도달 자동 보호(auto_pending) 건입니다.
          </p>
        </div>
        <div className='divide-y'>
          {queue.map((row) => (
            <div key={row.id} className='space-y-3 p-4'>
              <div className='flex items-center justify-between'>
                <div className='space-y-1'>
                  <p className='font-semibold'>{studentName(row)}</p>
                  <p className='text-text-muted text-xs'>
                    {row.status === 'requested' ? '학생 직접 신청' : '자동 보호 (30점 도달)'}
                    {' · '}
                    {new Date(row.requested_at).toLocaleDateString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                    })}
                    {' · 차감 '}
                    <strong>{row.points_used}점</strong>
                  </p>
                </div>
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      setRejectingId(row.id);
                      setIssuingId(null);
                    }}
                    disabled={busy}
                  >
                    거부
                  </Button>
                  <Button
                    size='sm'
                    onClick={() => {
                      setIssuingId(row.id);
                      setRejectingId(null);
                    }}
                    disabled={busy}
                  >
                    발급
                  </Button>
                </div>
              </div>

              {issuingId === row.id && (
                <div className='space-y-2 rounded-lg border bg-gray-50 p-3'>
                  <div className='flex items-center justify-between'>
                    <p className='text-xs font-semibold'>상품권 정보</p>
                    <button onClick={() => setIssuingId(null)} className='text-text-muted'>
                      <X className='h-4 w-4' />
                    </button>
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <div>
                      <label className='text-text-muted text-[10px]'>금액 (원)</label>
                      <Input
                        type='number'
                        value={voucherAmount}
                        onChange={(e) => setVoucherAmount(e.target.value)}
                        placeholder='10000'
                      />
                    </div>
                    <div>
                      <label className='text-text-muted text-[10px]'>상품권 코드</label>
                      <Input
                        value={voucherCode}
                        onChange={(e) => setVoucherCode(e.target.value)}
                        placeholder='ABCD-1234-5678'
                      />
                    </div>
                  </div>
                  <Button
                    size='sm'
                    className='w-full'
                    onClick={() => handleIssue(row)}
                    disabled={busy}
                  >
                    {busy ? '발급 중...' : '발급 확정'}
                  </Button>
                </div>
              )}

              {rejectingId === row.id && (
                <div className='space-y-2 rounded-lg border bg-gray-50 p-3'>
                  <div className='flex items-center justify-between'>
                    <p className='text-xs font-semibold'>거부 사유</p>
                    <button onClick={() => setRejectingId(null)} className='text-text-muted'>
                      <X className='h-4 w-4' />
                    </button>
                  </div>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder='거부 사유 입력'
                  />
                  <Button
                    size='sm'
                    variant='danger'
                    className='w-full'
                    onClick={() => handleReject(row)}
                    disabled={busy}
                  >
                    {busy ? '처리 중...' : '거부 확정'}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
