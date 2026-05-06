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
import type { MealMenu, MealOrder, MealProduct, MealProductVariant } from '@/types/database';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function mealTypeLabel(t: MealProduct['meal_type']): string {
  return t === 'lunch' ? '중식' : '석식';
}

function variantKindLabel(kind: 'one_time' | 'recurring'): string {
  return kind === 'recurring' ? '정기' : '일일';
}

export function ProductDetailClient({
  product,
  menus,
  capacityLeftByVariant,
  pendingOrderByVariant,
  paidOrderByVariant,
  payBasePath,
  studentId,
  backHref,
  initialVariantId,
}: {
  product: MealProductWithVariants;
  menus: MealMenu[];
  capacityLeftByVariant: Record<string, number | null>;
  pendingOrderByVariant: Record<string, MealOrder | null>;
  paidOrderByVariant: Record<string, MealOrder | null>;
  payBasePath: string;
  studentId: string | null;
  backHref: string;
  initialVariantId?: string | null;
}) {
  const router = useRouter();

  const variants = useMemo(
    () => product.variants.filter((v) => v.status === 'active'),
    [product.variants],
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialVariantId && variants.some((v) => v.id === initialVariantId)
      ? initialVariantId
      : (variants[0]?.id ?? null),
  );
  const [tab, setTab] = useState<'policy' | 'detail'>('detail');
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrders, setPendingOrders] =
    useState<Record<string, MealOrder | null>>(pendingOrderByVariant);
  const [menuOpen, setMenuOpen] = useState(false);
  const [conflict, setConflict] = useState<OrderConflictItem[] | null>(null);
  const [conflictMode, setConflictMode] = useState<'new' | 'resume'>('new');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const selected = variants.find((v) => v.id === selectedVariantId) ?? null;
  const capacityLeft = selected ? (capacityLeftByVariant[selected.id] ?? null) : null;
  const pending = selected ? (pendingOrders[selected.id] ?? null) : null;
  const paid = selected ? (paidOrderByVariant[selected.id] ?? null) : null;

  const filteredMenus = useMemo(() => {
    if (!selected) return [] as MealMenu[];
    return menus.filter(
      (m) => m.date >= selected.product_start_date && m.date <= selected.product_end_date,
    );
  }, [menus, selected]);

  const policy = useMemo(
    () => getRefundPolicy({ category: product.category, variantKind: selected?.kind }),
    [product.category, selected?.kind],
  );

  if (!studentId) {
    return (
      <Card className='space-y-3 p-6 text-center'>
        <p className='text-muted-foreground text-sm'>급식을 신청할 자녀를 먼저 선택해 주세요.</p>
        <Button variant='outline' onClick={() => router.push(backHref)}>
          목록으로
        </Button>
      </Card>
    );
  }

  if (variants.length === 0 || !selected) {
    return (
      <Card className='space-y-3 p-6 text-center'>
        <p className='text-muted-foreground text-sm'>판매 중인 옵션이 없습니다.</p>
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
      setPendingOrders((prev) => ({ ...prev, [selected.id]: null }));
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
      const res = await createMealOrder(
        selected.id,
        studentId,
        force ? { force: true } : undefined,
      );
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
        className='focus-visible:ring-primary relative -mx-0 block h-48 w-full overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:outline-none'
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
        <span className='bg-muted rounded-full px-2 py-0.5 text-xs font-medium'>
          {mealTypeLabel(product.meal_type)}
        </span>
        <h1 className='mt-2 text-xl font-bold'>{product.name}</h1>
        <p className='text-primary mt-2 text-lg font-semibold'>
          {selected.price.toLocaleString('ko-KR')}원
        </p>
        <p className='text-muted-foreground mt-2 text-xs'>
          식사 기간: {selected.product_start_date} ~ {selected.product_end_date}
        </p>
        {capacityLeft != null ? (
          <p className='text-muted-foreground mt-1 text-xs'>잔여 정원: {capacityLeft}명</p>
        ) : null}
      </div>

      {variants.length > 1 && (
        <div>
          <p className='mb-2 text-sm font-medium'>옵션 선택</p>
          <div className='space-y-2'>
            {variants.map((v) => (
              <VariantOption
                key={v.id}
                variant={v}
                selected={v.id === selectedVariantId}
                onSelect={() => setSelectedVariantId(v.id)}
                capacityLeft={capacityLeftByVariant[v.id] ?? null}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className='flex border-b'>
          <button
            type='button'
            onClick={() => setTab('detail')}
            className={cn(
              'flex-1 py-2.5 text-sm font-semibold transition-colors',
              tab === 'detail'
                ? 'border-primary text-primary border-b-2'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            상세 정보
          </button>
          <button
            type='button'
            onClick={() => setTab('policy')}
            className={cn(
              'flex-1 py-2.5 text-sm font-semibold transition-colors',
              tab === 'policy'
                ? 'border-primary text-primary border-b-2'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            취소 및 환불 정책
          </button>
        </div>

        {tab === 'detail' ? (
          <div className='mt-3 space-y-3'>
            {product.description ? (
              <p className='text-sm whitespace-pre-wrap'>{product.description}</p>
            ) : (
              <p className='text-muted-foreground text-sm'>등록된 설명이 없습니다.</p>
            )}

            {filteredMenus.length > 0 && (
              <div>
                <button
                  type='button'
                  className='bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors'
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <span>일별 메뉴 ({filteredMenus.length}일)</span>
                  {menuOpen ? <ChevronUp className='size-4' /> : <ChevronDown className='size-4' />}
                </button>
                {menuOpen && (
                  <ul className='mt-2 space-y-1.5'>
                    {filteredMenus.map((m) => (
                      <li key={m.id}>
                        <Card className='overflow-hidden p-0'>
                          <div className='flex items-center gap-2.5 px-2.5 py-2'>
                            {m.image_url && (
                              <div className='relative h-14 w-14 shrink-0 overflow-hidden rounded-md'>
                                <MealImage
                                  src={m.image_url}
                                  type='menu'
                                  alt={`${m.date} 식단`}
                                  fill
                                  className='rounded-md'
                                />
                              </div>
                            )}
                            <div className='min-w-0 flex-1'>
                              <p className='text-muted-foreground text-xs'>{m.date}</p>
                              <p className='mt-0.5 line-clamp-2 text-sm whitespace-pre-wrap'>
                                {m.menu_text}
                              </p>
                            </div>
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
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
        )}
      </div>

      {error && !paid ? <p className='text-sm text-red-600'>{error}</p> : null}

      {paid ? (
        <div
          className='w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-center text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
          role='status'
        >
          결제가 완료된 옵션입니다.
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
            loading || soldOut || product.status !== 'active' || selected.status !== 'active'
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
        <h2 className='text-base font-semibold'>이미 신청한 식사 일자와 겹칩니다</h2>
        <div className='bg-muted/50 rounded-md p-3'>
          <ul className='space-y-1 text-sm'>
            {conflicts.map((c) => (
              <li key={c.variant_id}>
                <span className='font-medium'>{c.product_name}</span>
                <span className='text-muted-foreground ml-1'>
                  · {c.variant_kind === 'recurring' ? '정기' : '일일'} · {c.product_start_date} ~{' '}
                  {c.product_end_date}
                  {c.status === 'pending' ? ' (결제 대기)' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className='text-sm text-red-600'>
          부분 취소가 불가능하므로, 중복된 일자는 별도 환불 없이 두 번 결제됩니다. 그대로
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

function VariantOption({
  variant,
  selected,
  onSelect,
  capacityLeft,
}: {
  variant: MealProductVariant;
  selected: boolean;
  onSelect: () => void;
  capacityLeft: number | null;
}) {
  const soldOut = capacityLeft != null && capacityLeft <= 0;
  return (
    <button
      type='button'
      onClick={onSelect}
      disabled={soldOut}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
        soldOut && 'opacity-50',
      )}
    >
      <div className='flex items-center justify-between'>
        <span className='text-sm font-semibold'>
          {variantKindLabel(variant.kind)}
          {variant.kind === 'recurring' ? ' (월~금 묶음)' : ''}
        </span>
        <span className='text-primary text-sm font-semibold'>
          {variant.price.toLocaleString('ko-KR')}원
        </span>
      </div>
      <p className='text-muted-foreground mt-1 text-xs'>
        {variant.product_start_date} ~ {variant.product_end_date}
        {capacityLeft != null ? ` · 잔여 ${capacityLeft}명` : ''}
        {soldOut ? ' · 마감' : ''}
      </p>
    </button>
  );
}
