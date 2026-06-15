'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MealImage } from '@/components/shared/meal-image';
import { ImageLightbox } from '@/components/shared/image-lightbox';
import {
  cancelPendingMealOrder,
  getOrderResumeConflicts,
  type MealProductWithVariants,
  type MockExamOptionGroupWithOptions,
  type OrderConflictItem,
} from '@/lib/actions/meal';
import { ConflictDialog } from '@/components/shared/payment/conflict-dialog';
import { encodeOptionSelectionsParam } from '@/lib/mock-exam-options';
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
  optionGroups,
}: {
  product: MealProductWithVariants;
  capacityLeftByVariant: Record<string, number | null>;
  pendingOrderByVariant: Record<string, MealOrder | null>;
  paidOrderByVariant: Record<string, MealOrder | null>;
  payBasePath: string;
  studentId: string | null;
  backHref: string;
  optionGroups: MockExamOptionGroupWithOptions[];
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
  // groupId -> 선택한 optionId 목록 (단일 그룹은 0~1개, 복수 그룹은 0개 이상)
  const [optionSelections, setOptionSelections] = useState<Record<string, string[]>>({});

  const requiredGroupsAllSelected = useMemo(() => {
    for (const g of optionGroups) {
      if (g.is_required && !optionSelections[g.id]?.length) return false;
    }
    return true;
  }, [optionGroups, optionSelections]);

  const toggleOption = (group: MockExamOptionGroupWithOptions, optionId: string) => {
    setOptionSelections((prev) => {
      const current = prev[group.id] ?? [];
      if (group.select_type === 'multiple') {
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [group.id]: next };
      }
      // 단일 선택: 같은 옵션 재클릭 시 해제, 아니면 교체
      const next = current.includes(optionId) ? [] : [optionId];
      return { ...prev, [group.id]: next };
    });
  };
  const [conflict, setConflict] = useState<OrderConflictItem[] | null>(null);
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

  // 주문(pending)은 결제 페이지의 "카드 결제하기" 시점에 생성된다. 여기선 결제 페이지로 이동만 한다.
  // 선택한 옵션은 opts 쿼리로 운반(서버 startMealPayment 가 재검증/저장). resume 는 opts 없이 진입(기존 주문 재사용).
  const goToPay = (optsParam: string) => {
    const sid = studentId ?? '';
    const query = `?for=${encodeURIComponent(sid)}${optsParam ? `&opts=${optsParam}` : ''}`;
    router.push(`${payBasePath}/${variant.id}${query}`);
  };

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
        setConflict(res.conflicts);
        return;
      }
      goToPay('');
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

  const handlePay = () => {
    setError(null);
    if (!requiredGroupsAllSelected) {
      setError('필수 옵션을 모두 선택해 주세요.');
      return;
    }
    const selections = optionGroups.flatMap((g) =>
      (optionSelections[g.id] ?? []).map((optionId) => ({
        group_id: g.id,
        option_id: optionId,
      })),
    );
    goToPay(encodeOptionSelectionsParam(selections));
  };

  // 이어서 결제(resume) 중 겹침 동의 → 결제 페이지로 이동(기존 pending 재사용).
  const handleForcePay = () => {
    setConflict(null);
    goToPay('');
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

      {!paid && optionGroups.length > 0 ? (
        <div>
          <h2 className='border-b py-2.5 text-sm font-semibold'>응시 옵션 선택</h2>
          <div className='mt-3 space-y-4'>
            {optionGroups.map((g) => (
              <div key={g.id}>
                <p className='mb-2 text-sm font-medium'>
                  {g.name}
                  {g.is_required ? <span className='text-red-600'> *</span> : null}
                  {g.select_type === 'multiple' ? (
                    <span className='text-muted-foreground ml-1 text-xs font-normal'>
                      (복수 선택 가능)
                    </span>
                  ) : null}
                </p>
                <div className='flex flex-wrap gap-2'>
                  {g.options.map((opt) => {
                    const selected = (optionSelections[g.id] ?? []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type='button'
                        onClick={() => toggleOption(g, opt.id)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-sm transition-colors',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input bg-background hover:bg-muted',
                        )}
                        aria-pressed={selected}
                      >
                        {opt.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
            loading ||
            soldOut ||
            product.status !== 'active' ||
            variant.status !== 'active' ||
            !requiredGroupsAllSelected
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
          ) : !requiredGroupsAllSelected ? (
            '옵션을 선택해 주세요'
          ) : (
            '결제하기'
          )}
        </Button>
      )}

      {conflict && conflict.length > 0 ? (
        <ConflictDialog
          conflicts={conflict}
          category='exam'
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
