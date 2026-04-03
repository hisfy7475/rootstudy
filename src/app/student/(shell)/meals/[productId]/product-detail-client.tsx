'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createMealOrder, cancelPendingMealOrder } from '@/lib/actions/meal';
import type { MealMenu, MealOrder, MealProduct } from '@/types/database';
import { Loader2 } from 'lucide-react';

function mealTypeLabel(t: MealProduct['meal_type']): string {
  return t === 'lunch' ? '중식' : '석식';
}

export function ProductDetailClient({
  product,
  menus,
  capacityLeft,
  payBasePath,
  studentId,
  backHref,
  pendingOrder: initialPending,
}: {
  product: MealProduct;
  menus: MealMenu[];
  capacityLeft: number | null;
  payBasePath: string;
  studentId: string | null;
  backHref: string;
  pendingOrder?: MealOrder | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<MealOrder | null>(initialPending ?? null);

  const handleResumePay = () => {
    if (pendingOrder) {
      router.push(`${payBasePath}/${pendingOrder.id}`);
    }
  };

  const handleCancelPending = async () => {
    if (!pendingOrder) return;
    setError(null);
    setCancelling(true);
    try {
      const { error: err } = await cancelPendingMealOrder(pendingOrder.id);
      if (err) {
        setError(err);
        return;
      }
      setPendingOrder(null);
    } catch (e) {
      console.error(e);
      setError('취소에 실패했습니다.');
    } finally {
      setCancelling(false);
    }
  };

  const handlePay = async () => {
    if (!studentId) {
      setError('자녀를 선택해 주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data, error: err } = await createMealOrder(product.id, studentId);
      if (err || !data) {
        setError(err || '주문 생성에 실패했습니다.');
        setLoading(false);
        return;
      }
      router.push(`${payBasePath}/${data.id}`);
    } catch (e) {
      console.error(e);
      setError('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!studentId) {
    return (
      <Card className="p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">급식을 신청할 자녀를 먼저 선택해 주세요.</p>
        <Button variant="outline" onClick={() => router.push(backHref)}>
          목록으로
        </Button>
      </Card>
    );
  }

  const soldOut = capacityLeft != null && capacityLeft <= 0;

  return (
    <div className="space-y-4">
      <div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">
          {mealTypeLabel(product.meal_type)}
        </span>
        <h1 className="text-xl font-bold mt-2">{product.name}</h1>
        <p className="text-lg font-semibold text-primary mt-2">
          {product.price.toLocaleString('ko-KR')}원
        </p>
        {product.description ? (
          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{product.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground mt-2">
          식사 기간: {product.meal_start_date} ~ {product.meal_end_date}
        </p>
        {capacityLeft != null ? (
          <p className="text-xs text-muted-foreground mt-1">잔여 정원: {capacityLeft}명</p>
        ) : null}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">일별 메뉴</h2>
        {menus.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">등록된 메뉴가 없습니다.</Card>
        ) : (
          <ul className="space-y-2">
            {menus.map((m) => (
              <li key={m.id}>
                <Card className="p-3">
                  <p className="text-xs text-muted-foreground">{m.date}</p>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{m.menu_text}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {pendingOrder ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-600">
            이전에 결제가 완료되지 않은 주문이 있습니다.
          </p>
          <Button
            className="w-full"
            size="lg"
            onClick={handleResumePay}
          >
            결제 계속하기
          </Button>
          <Button
            className="w-full"
            size="lg"
            variant="outline"
            disabled={cancelling}
            onClick={() => void handleCancelPending()}
          >
            {cancelling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                취소 중…
              </>
            ) : (
              '주문 취소 후 다시 신청'
            )}
          </Button>
        </div>
      ) : (
        <Button
          className="w-full"
          size="lg"
          disabled={loading || soldOut || product.status !== 'active'}
          onClick={() => void handlePay()}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              처리 중…
            </>
          ) : soldOut ? (
            '정원 마감'
          ) : (
            '결제하기'
          )}
        </Button>
      )}
    </div>
  );
}
