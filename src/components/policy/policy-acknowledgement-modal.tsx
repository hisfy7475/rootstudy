'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { acknowledgePolicy } from '@/lib/actions/student';
import { PENALTY_RULES, REWARD_RULES } from '@/lib/constants';
import { AlertTriangle, Award, X, Info } from 'lucide-react';

interface PolicyAcknowledgementModalProps {
  open: boolean;
  onClose: () => void;
  /** true 면 "확인했어요" 클릭 시 acknowledgePolicy 호출. 단순 안내용이면 false. */
  recordAck?: boolean;
}

/**
 * 상벌점·몰입도 정책 안내 모달.
 *
 * /student/points 화면의 정책 보기 버튼으로만 열린다 (자동 노출 없음).
 * recordAck 옵션이 true 면 닫기 시 acknowledgePolicy 호출.
 */
export function PolicyAcknowledgementModal({
  open,
  onClose,
  recordAck = false,
}: PolicyAcknowledgementModalProps) {
  const [busy, startBusy] = useTransition();

  if (!open) return null;

  const handleAck = () => {
    if (!recordAck) {
      onClose();
      return;
    }
    startBusy(async () => {
      await acknowledgePolicy();
      onClose();
    });
  };

  return (
    <div className='fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4'>
      <Card className='max-h-[90vh] w-full max-w-md overflow-y-auto p-6'>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-lg font-bold'>상벌점·몰입도 정책 안내</h2>
          <button onClick={onClose} className='text-text-muted hover:text-text' aria-label='닫기'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-3 text-sm'>
          <div className='flex gap-2 rounded-lg bg-green-50 p-3'>
            <Award className='h-5 w-5 flex-shrink-0 text-green-600' />
            <div>
              <p className='font-semibold text-green-700'>
                상점 {REWARD_RULES.redeemAt}점 = 상품권 1장
              </p>
              <p className='text-text-muted text-xs'>
                평일 3시간 학습 + 미분류 ≤ 5분 시 매일 자동 +1점
              </p>
            </div>
          </div>

          <div className='flex gap-2 rounded-lg bg-red-50 p-3'>
            <AlertTriangle className='h-5 w-5 flex-shrink-0 text-red-600' />
            <div>
              <p className='font-semibold text-red-700'>
                분기 벌점 {PENALTY_RULES.withdrawAt}점 도달 시
              </p>
              <p className='text-text-muted text-xs'>
                보유 상점과 1:1 상계됩니다. 가용 상점이 없으면 강제 퇴원 대상으로 분류되며, 관리자
                면담 후 처리됩니다. (발급 대기 상점은 상계 대상에서 보호)
              </p>
            </div>
          </div>

          <ul className='text-text-muted space-y-1.5 text-xs leading-relaxed'>
            <li>· 벌점은 분기(3·6·9·12월 1일)마다 0으로 초기화됩니다.</li>
            <li>
              · {PENALTY_RULES.warn10}점·{PENALTY_RULES.warn20}점·{PENALTY_RULES.warn25}점에서
              단계별 안내가 발송됩니다.
            </li>
            <li>· 신규생은 첫 등원 주 최소시간 미달 벌점이 면제됩니다.</li>
            <li>· 상품권은 상점 100점 달성 시 자동으로 발급 대기에 등록됩니다.</li>
          </ul>

          <Link
            href='/policy/points'
            className='block text-center text-xs text-blue-600 underline'
            onClick={onClose}
          >
            전체 정책 보기
          </Link>
        </div>

        <div className='mt-5 flex gap-2'>
          <Button onClick={handleAck} disabled={busy} className='flex-1'>
            {busy ? '확인 중...' : '확인했어요'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** /student/points 헤더용 정책 보기 트리거 버튼 + 모달 통합 컴포넌트. */
export function PolicyHelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100'
      >
        <Info className='h-3.5 w-3.5' />
        정책 보기
      </button>
      <PolicyAcknowledgementModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
