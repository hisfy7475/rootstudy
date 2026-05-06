'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MealImage } from '@/components/shared/meal-image';
import { ImageLightbox } from '@/components/shared/image-lightbox';
import {
  createMealOrder,
  cancelPendingMealOrder,
  getOrderResumeConflicts,
  type MealProductWithVariants,
  type OrderConflictItem,
} from '@/lib/actions/meal';
import { getRefundPolicy } from '@/lib/refund-policy';
import type { MealOrder } from '@/types/database';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MockExamDetailClient({
  product,
  capacityLeftByVariant,
  pendingOrderByVariant,
  paidOrderByVariant,
  payBasePath,
  studentId,
  backHref,
}: {
  product: MealProductWithVariants;
  capacityLeftByVariant: Record<string, number | null>;
  pendingOrderByVariant: Record<string, MealOrder | null>;
  paidOrderByVariant: Record<string, MealOrder | null>;
  payBasePath: string;
  studentId: string | null;
  backHref: string;
}) {
  const router = useRouter();
  const variant = useMemo(
    () => product.variants.find((v) => v.status === 'active') ?? product.variants[0] ?? null,
    [product.variants],
  );

  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<MealOrder | null>(
    variant ? (pendingOrderByVariant[variant.id] ?? null) : null,
  );
  const [conflict, setConflict] = useState<OrderConflictItem[] | null>(null);
  const [conflictMode, setConflictMode] = useState<'new' | 'resume'>('new');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const paid = variant ? (paidOrderByVariant[variant.id] ?? null) : null;
  const capacityLeft = variant ? (capacityLeftByVariant[variant.id] ?? null) : null;

  const policy = useMemo(
    () => getRefundPolicy({ category: product.category, variantKind: variant?.kind }),
    [product.category, variant?.kind],
  );

  if (!studentId) {
    return (
      <Card className='space-y-3 p-6 text-center'>
        <p className='text-muted-foreground text-sm'>
          모의고사를 신청할 자녀를 먼저 선택해 주세요.
        </p>
        <Button variant='outline' onClick={() => router.push(backHref)}>
          목록으로
        </Button>
      </Card>
    );
  }

  if (!variant) {
    return (
      <Card className='space-y-3 p-6 text-center'>
        <p className='text-muted-foreground text-sm'>판매 중인 모의고사가 없습니다.</p>
      </Card>
    );
  }

  const soldOut = capacityLeft != null && capacityLeft <= 0;

  const handleResumePay = async () => {
    if (!pending) return;
    setError(null);
    setLoading(true);
    try {
      const res = await getOrderResumeConflicts(pending.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.conflicts && res.conflicts.length > 0) {
        setConflictMode('resume');
        setConflict(res.conflicts);
        return;
      }
      router.push(`${payBasePath}/${pending.id}`);
    } catch (e) {
      console.error(e);
      setError('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPending = async () => {
    if (!pending) return;
    setError(null);
    setCancelling(true);
    try {
      const { error: err } = await cancelPendingMealOrder(pending.id);
      if (err) {
        setError(err);
        return;
      }
      setPending(null);
    } catch (e) {
      console.error(e);
      setError('취소에 실패했습니다.');
    } finally {
      setCancelling(false);
    }
  };

  const submitOrder = async (force: boolean) => {
    setError(null);
    setLoading(true);
    try {
      const res = await createMealOrder(variant.id, studentId, force ? { force: true } : undefined);
      if (res.conflict && res.conflict.length > 0 && !force) {
        setConflictMode('new');
        setConflict(res.conflict);
        return;
      }
      if (res.error || !res.data) {
        setError(res.error || '주문 생성에 실패했습니다.');
        return;
      }
      router.push(`${payBasePath}/${res.data.id}`);
    } catch (e) {
      console.error(e);
      setError('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = () => {
    setConflictMode('new');
    void submitOrder(false);
  };
  const handleForcePay = () => {
    setConflict(null);
    if (conflictMode === 'resume') {
      if (pending) router.push(`${payBasePath}/${pending.id}`);
      return;
    }
    void submitOrder(true);
  };

  return (
    <div className='space-y-4'>
      <button
        type='button'
        onClick={() => setLightboxOpen(true)}
        aria-label={`${product.name} 이미지 확대`}
        className='focus-visible:ring-primary relative -mx-0 block aspect-square w-full overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:outline-none'
      >
        <MealImage
          src={product.image_url}
          type='product'
          alt={product.name}
          fill
          priority
          className='rounded-xl'
        />
      </button>

      <div>
        <span className='bg-muted rounded-full px-2 py-0.5 text-xs font-medium'>모의고사</span>
        <h1 className='mt-2 text-xl font-bold'>{product.name}</h1>
        <p className='text-primary mt-2 text-lg font-semibold'>
          {variant.price.toLocaleString('ko-KR')}원
        </p>
        <p className='text-muted-foreground mt-2 text-xs'>
          시험 기간: {variant.product_start_date} ~ {variant.product_end_date}
        </p>
        {capacityLeft != null ? (
          <p className='text-muted-foreground mt-1 text-xs'>잔여 정원: {capacityLeft}명</p>
        ) : null}
      </div>

      <div>
        <h2 className='border-b py-2.5 text-sm font-semibold'>상세 정보</h2>
        <div className='mt-3'>
          {product.description ? (
            <p className='text-sm whitespace-pre-wrap'>{product.description}</p>
          ) : (
            <p className='text-muted-foreground text-sm'>등록된 설명이 없습니다.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className='border-b py-2.5 text-sm font-semibold'>취소 및 환불 정책</h2>
        <div className='bg-muted/50 mt-3 space-y-1.5 rounded-lg p-4'>
          <ul className='space-y-1.5 text-sm'>
            {policy.lines.map((line, idx) => (
              <li
                key={idx}
                className={cn('flex gap-2', line.emphasized && 'font-semibold text-red-600')}
              >
                <span aria-hidden>•</span>
                <span className='whitespace-pre-wrap'>{line.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error && !paid ? <p className='text-sm text-red-600'>{error}</p> : null}

      {paid ? (
        <div
          className='w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-center text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
          role='status'
        >
          결제가 완료된 모의고사입니다.
        </div>
      ) : pending ? (
        <div className='space-y-2'>
          <p className='text-sm text-amber-600'>이전에 결제가 완료되지 않은 주문이 있습니다.</p>
          <div className='flex gap-2'>
            <Button
              className='flex-1'
              size='lg'
              disabled={loading}
              onClick={() => void handleResumePay()}
            >
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
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  취소 중…
                </>
              ) : (
                '주문 취소'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className='w-full'
          size='lg'
          disabled={
            loading || soldOut || product.status !== 'active' || variant.status !== 'active'
          }
          onClick={handlePay}
        >
          {loading ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              처리 중…
            </>
          ) : soldOut ? (
            '정원 마감'
          ) : (
            '결제하기'
          )}
        </Button>
      )}

      {conflict && conflict.length > 0 ? (
        <ConflictDialog
          conflicts={conflict}
          loading={loading}
          onCancel={() => setConflict(null)}
          onConfirm={handleForcePay}
        />
      ) : null}

      <ImageLightbox
        open={lightboxOpen}
        src={product.image_url}
        alt={product.name}
        fallbackType='product'
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}

function ConflictDialog({
  conflicts,
  loading,
  onCancel,
  onConfirm,
}: {
  conflicts: OrderConflictItem[];
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center'>
      <Card className='w-full max-w-md space-y-3 p-5'>
        <h2 className='text-base font-semibold'>이미 신청한 시험 일자와 겹칩니다</h2>
        <div className='bg-muted/50 rounded-md p-3'>
          <ul className='space-y-1 text-sm'>
            {conflicts.map((c) => (
              <li key={c.variant_id}>
                <span className='font-medium'>{c.product_name}</span>
                <span className='text-muted-foreground ml-1'>
                  · {c.product_start_date} ~ {c.product_end_date}
                  {c.status === 'pending' ? ' (결제 대기)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className='text-sm text-red-600'>
          모의고사는 결제 후 취소가 불가하며, 중복된 일정은 별도 환불 없이 두 번 결제됩니다. 그대로
          진행하시겠습니까?
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
