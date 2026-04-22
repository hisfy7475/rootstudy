'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  cancelMealOrder,
  type MealOrderWithProduct,
  type ProductCategory,
} from '@/lib/actions/meal';
import { canCancelMealOrderByDeadline } from '@/lib/meal-order-rules';
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

/**
 * 학생·학부모 본인/자녀 주문 내역 목록 (meal/exam 공용).
 * fallbackName 만 category 로 분기하고 나머지 로직은 공유.
 */
export function UserOrdersClient({
  initialOrders,
  category,
}: {
  initialOrders: MealOrderWithProduct[];
  category: ProductCategory;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fallbackName = category === 'exam' ? '모의고사' : '급식';

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
        const p = Array.isArray(o.meal_products) ? o.meal_products[0] : o.meal_products;
        const name = p?.name ?? fallbackName;
        const productStart = p?.product_start_date;
        const canCancel =
          o.status === 'paid' && productStart && canCancelMealOrderByDeadline(productStart);

        return (
          <li key={o.id}>
            <Card className='space-y-2 p-4'>
              <div className='flex justify-between gap-2'>
                <h2 className='leading-tight font-semibold'>{name}</h2>
                <span className='bg-muted h-fit shrink-0 rounded-full px-2 py-0.5 text-xs'>
                  {statusLabel(o.status)}
                </span>
              </div>
              <p className='text-muted-foreground text-sm'>
                {o.amount.toLocaleString('ko-KR')}원 ·{' '}
                {new Date(o.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
              </p>
              {o.status === 'paid' && canCancel ? (
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
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
