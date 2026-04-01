'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cancelMealOrder, type MealOrderWithProduct } from '@/lib/actions/meal';
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

export function OrdersClient({ initialOrders }: { initialOrders: MealOrderWithProduct[] }) {
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
      prev.map((o) => (o.id === id ? { ...o, status: 'cancelled' as const } : o))
    );
  };

  if (orders.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">신청 내역이 없습니다.</Card>
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => {
        const p = Array.isArray(o.meal_products) ? o.meal_products[0] : o.meal_products;
        const name = p?.name ?? '급식';
        const mealStart = p?.meal_start_date;
        const canCancel =
          o.status === 'paid' &&
          mealStart &&
          canCancelMealOrderByDeadline(mealStart);

        return (
          <li key={o.id}>
            <Card className="p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <h2 className="font-semibold leading-tight">{name}</h2>
                <span className="text-xs shrink-0 px-2 py-0.5 rounded-full bg-muted h-fit">
                  {statusLabel(o.status)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {o.amount.toLocaleString('ko-KR')}원 · {new Date(o.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
              </p>
              {o.status === 'paid' && canCancel ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === o.id}
                  onClick={() => void onCancel(o.id)}
                >
                  {busyId === o.id ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
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
