"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MealImage } from "@/components/shared/meal-image";
import { createMealOrder, cancelPendingMealOrder } from "@/lib/actions/meal";
import type { MealOrder, MealProduct } from "@/types/database";
import { Loader2 } from "lucide-react";

export function MockExamDetailClient({
  product,
  capacityLeft,
  payBasePath,
  studentId,
  backHref,
  pendingOrder: initialPending,
  paidOrder: initialPaid,
}: {
  product: MealProduct;
  capacityLeft: number | null;
  payBasePath: string;
  studentId: string | null;
  backHref: string;
  pendingOrder?: MealOrder | null;
  paidOrder?: MealOrder | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<MealOrder | null>(initialPending ?? null);
  const [paidOrder] = useState<MealOrder | null>(initialPaid ?? null);

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
      setError("취소에 실패했습니다.");
    } finally {
      setCancelling(false);
    }
  };

  const handlePay = async () => {
    if (!studentId) {
      setError("자녀를 선택해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data, error: err } = await createMealOrder(product.id, studentId);
      if (err || !data) {
        setError(err || "주문 생성에 실패했습니다.");
        setLoading(false);
        return;
      }
      router.push(`${payBasePath}/${data.id}`);
    } catch (e) {
      console.error(e);
      setError("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!studentId) {
    return (
      <Card className='p-6 text-center space-y-3'>
        <p className='text-sm text-muted-foreground'>
          모의고사를 신청할 자녀를 먼저 선택해 주세요.
        </p>
        <Button variant='outline' onClick={() => router.push(backHref)}>
          목록으로
        </Button>
      </Card>
    );
  }

  const soldOut = capacityLeft != null && capacityLeft <= 0;

  return (
    <div className='space-y-4'>
      <div className='relative h-48 w-full overflow-hidden rounded-xl -mx-0'>
        <MealImage
          src={product.image_url}
          type='product'
          alt={product.name}
          fill
          priority
          className='rounded-xl'
        />
      </div>

      <div>
        <span className='text-xs font-medium px-2 py-0.5 rounded-full bg-muted'>모의고사</span>
        <h1 className='text-xl font-bold mt-2'>{product.name}</h1>
        <p className='text-lg font-semibold text-primary mt-2'>
          {product.price.toLocaleString("ko-KR")}원
        </p>
        {product.description ? (
          <p className='text-sm text-muted-foreground mt-2 whitespace-pre-wrap'>
            {product.description}
          </p>
        ) : null}
        <p className='text-xs text-muted-foreground mt-2'>
          시험 기간: {product.meal_start_date} ~ {product.meal_end_date}
        </p>
        {capacityLeft != null ? (
          <p className='text-xs text-muted-foreground mt-1'>잔여 정원: {capacityLeft}명</p>
        ) : null}
      </div>

      {error && !paidOrder ? <p className='text-sm text-red-600'>{error}</p> : null}

      {paidOrder ? (
        <div
          className='w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-center text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
          role='status'
        >
          결제가 완료된 건입니다.
        </div>
      ) : pendingOrder ? (
        <div className='space-y-2'>
          <p className='text-sm text-amber-600'>이전에 결제가 완료되지 않은 주문이 있습니다.</p>
          <div className='flex gap-2'>
            <Button className='flex-1' size='lg' onClick={handleResumePay}>
              결제 계속하기
            </Button>
            <Button
              className='flex-1'
              size='lg'
              variant='outline'
              disabled={cancelling}
              onClick={() => void handleCancelPending()}
            >
              {cancelling ? (
                <>
                  <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  취소 중…
                </>
              ) : (
                "주문 취소"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className='w-full'
          size='lg'
          disabled={loading || soldOut || product.status !== "active"}
          onClick={() => void handlePay()}
        >
          {loading ? (
            <>
              <Loader2 className='w-4 h-4 mr-2 animate-spin' />
              처리 중…
            </>
          ) : soldOut ? (
            "정원 마감"
          ) : (
            "결제하기"
          )}
        </Button>
      )}
    </div>
  );
}
