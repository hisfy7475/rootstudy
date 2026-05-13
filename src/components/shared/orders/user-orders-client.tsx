'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  cancelMealOrder,
  type MealOrderWithProduct,
  type ProductCategory,
} from '@/lib/actions/meal';
import { canCancelOrder, cancelReasonMessage } from '@/lib/meal-order-rules';
import { Loader2 } from 'lucide-react';

function statusLabel(s: MealOrderWithProduct['status']): string {
  switch (s) {
    case 'pending':
      return '결제 대기';
    case 'paid':
      return '결제 완료';
    case 'cancelled':
      return '취소됨';
    case 'refunded':
      return '환불됨';
    case 'failed':
      return '실패';
    default:
      return s;
  }
}

function variantKindLabel(kind: 'one_time' | 'recurring' | undefined): string | null {
  if (kind === 'recurring') return '정기';
  if (kind === 'one_time') return '일일';
  return null;
}

export function UserOrdersClient({
  initialOrders,
  category,
  studentInfoById,
}: {
  initialOrders: MealOrderWithProduct[];
  category?: ProductCategory;
  /** 자녀 표시용 정보 — 학부모 화면에서만 사용. 퇴원 자녀 배지 노출에 필요. */
  studentInfoById?: Record<string, { name: string; withdrawnAt: string | null }>;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onCancel = async (id: string) => {
    if (!confirm('결제를 취소하고 환불하시겠습니까?')) return;
    setBusyId(id);
    const res = await cancelMealOrder(id);
    setBusyId(null);
    if (res.error) {
      alert(res.error);
      return;
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'cancelled' as const } : o)),
    );
  };

  if (orders.length === 0) {
    return (
      <Card className='text-muted-foreground p-6 text-center text-sm'>신청 내역이 없습니다.</Card>
    );
  }

  return (
    <ul className='space-y-3'>
      {orders.map((o) => {
        const productCategory: ProductCategory = o.product?.category ?? category ?? 'meal';
        const productName = o.product?.name ?? (productCategory === 'exam' ? '모의고사' : '급식');
        const variantKindText = variantKindLabel(o.variant?.kind);
        const decision =
          o.variant && o.variant.product_start_date
            ? canCancelOrder({
                category: productCategory,
                variantKind: o.variant.kind,
                productStart: o.variant.product_start_date,
              })
            : null;
        const showCancel = o.status === 'paid' && decision?.ok === true;
        const cancelHint =
          o.status === 'paid' && decision && !decision.ok
            ? cancelReasonMessage(decision.reason)
            : null;

        return (
          <li key={o.id}>
            <Card className='space-y-2 p-4'>
              <div className='flex justify-between gap-2'>
                <h2 className='leading-tight font-semibold'>
                  {productName}
                  {variantKindText ? (
                    <span className='text-muted-foreground ml-1 text-xs font-normal'>
                      · {variantKindText}
                    </span>
                  ) : null}
                </h2>
                <div className='flex h-fit shrink-0 items-center gap-1.5'>
                  {studentInfoById?.[o.student_id] ? (
                    <span className='bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium'>
                      {studentInfoById[o.student_id].name}
                      {studentInfoById[o.student_id].withdrawnAt ? (
                        <span className='rounded bg-gray-200 px-1 text-[10px] text-gray-700'>
                          퇴원
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  <span className='bg-muted rounded-full px-2 py-0.5 text-xs'>
                    {statusLabel(o.status)}
                  </span>
                </div>
              </div>
              <p className='text-muted-foreground text-sm'>
                {o.amount.toLocaleString('ko-KR')}원 ·{' '}
                {new Date(o.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                {o.seat_number_snapshot != null ? (
                  <span className='ml-1'>· 좌석 {o.seat_number_snapshot}</span>
                ) : null}
              </p>
              {o.variant?.product_start_date && o.variant?.product_end_date ? (
                <p className='text-muted-foreground text-xs'>
                  {productCategory === 'exam' ? '시험 기간' : '식사 기간'}:{' '}
                  {o.variant.product_start_date} ~ {o.variant.product_end_date}
                </p>
              ) : null}
              {showCancel ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={busyId === o.id}
                  onClick={() => void onCancel(o.id)}
                >
                  {busyId === o.id ? (
                    <>
                      <Loader2 className='mr-1 h-3 w-3 animate-spin' />
                      처리 중…
                    </>
                  ) : (
                    '결제 취소'
                  )}
                </Button>
              ) : cancelHint ? (
                <p className='text-muted-foreground text-xs'>{cancelHint}</p>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
