'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { OrderConflictItem } from '@/lib/actions/meal';

/**
 * 식사일/시험일 겹침 확인 다이얼로그 (급식·모의고사·결제 페이지 공용).
 * category 로 제목/경고문/옵션종류(정기·일일) 표기를 분기한다.
 */
export function ConflictDialog({
  conflicts,
  category,
  loading,
  onCancel,
  onConfirm,
}: {
  conflicts: OrderConflictItem[];
  category: 'meal' | 'exam';
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isExam = category === 'exam';
  return (
    <div className='pb-safe-nav fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4 sm:items-center sm:pb-4'>
      <Card className='w-full max-w-md space-y-3 p-5'>
        <h2 className='text-base font-semibold'>
          {isExam ? '이미 신청한 시험 일자와 겹칩니다' : '이미 신청한 식사 일자와 겹칩니다'}
        </h2>
        <div className='bg-muted/50 rounded-md p-3'>
          <ul className='space-y-1 text-sm'>
            {conflicts.map((c) => (
              <li key={c.variant_id}>
                <span className='font-medium'>{c.product_name}</span>
                <span className='text-muted-foreground ml-1'>
                  {' · '}
                  {isExam ? '' : `${c.variant_kind === 'recurring' ? '정기' : '일일'} · `}
                  {`${c.product_start_date} ~ ${c.product_end_date}`}
                  {c.status === 'pending' ? ' (결제 대기)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className='text-sm text-red-600'>
          {isExam
            ? '모의고사는 결제 후 취소가 불가하며, 중복된 일정은 별도 환불 없이 두 번 결제됩니다. 그대로 진행하시겠습니까?'
            : '부분 취소가 불가능하므로, 중복된 일자는 별도 환불 없이 두 번 결제됩니다. 그대로 진행하시겠습니까?'}
        </p>
        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={onCancel} disabled={loading}>
            취소
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className='size-4 animate-spin' /> : '그대로 결제'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
