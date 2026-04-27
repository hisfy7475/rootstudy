'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MealProduct, MealProductVariant } from '@/types/database';
import { Card } from '@/components/ui/card';
import { MealImage } from '@/components/shared/meal-image';
import { cn } from '@/lib/utils';

type Student = { id: string; name: string; branchId?: string | null };

type ProductWithVariants = MealProduct & { variants: MealProductVariant[] };

function mealTypeLabel(t: MealProduct['meal_type']): string {
  return t === 'lunch' ? '중식' : '석식';
}

function priceLabel(variants: MealProductVariant[]): string {
  if (variants.length === 0) return '-';
  const prices = variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `${min.toLocaleString('ko-KR')}원`;
  return `${min.toLocaleString('ko-KR')}원~`;
}

function variantSummary(variants: MealProductVariant[]): string | null {
  if (variants.length <= 1) return null;
  const oneTime = variants.filter((v) => v.kind === 'one_time').length;
  const recurring = variants.filter((v) => v.kind === 'recurring').length;
  const parts: string[] = [];
  if (oneTime) parts.push(`일일 ${oneTime}`);
  if (recurring) parts.push(`정기 ${recurring}`);
  return `옵션 ${parts.join(', ')}`;
}

export function ParentMealsClient({
  initialProducts,
  students,
  orderStatusByStudentId = {},
}: {
  initialProducts: ProductWithVariants[];
  students: Student[];
  orderStatusByStudentId?: Record<string, Record<string, 'pending' | 'paid'>>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(students[0]?.id ?? null);

  const orderStatusByProductId =
    selectedId != null ? (orderStatusByStudentId[selectedId] ?? {}) : {};

  const selectedStudent = students.find((s) => s.id === selectedId) ?? null;
  const selectedBranchId = selectedStudent?.branchId ?? null;

  if (students.length === 0) {
    return (
      <Card className='text-muted-foreground p-6 text-center text-sm'>
        연결된 자녀가 없습니다. 관리자에게 문의하세요.
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      <Card className='p-3'>
        <p className='text-muted-foreground mb-2 text-xs'>자녀 선택</p>
        <div className='flex flex-wrap gap-2'>
          {students.map((s) => (
            <button
              key={s.id}
              type='button'
              onClick={() => setSelectedId(s.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                selectedId === s.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-foreground',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </Card>

      {selectedId ? (
        <ul className='space-y-3'>
          {initialProducts.length === 0 ? (
            <Card className='text-muted-foreground p-6 text-center text-sm'>
              현재 신청 가능한 급식이 없습니다.
            </Card>
          ) : (
            initialProducts.map((p) => {
              const orderState = orderStatusByProductId[p.id];
              const branchMismatch = selectedBranchId != null && p.branch_id !== selectedBranchId;
              const summary = variantSummary(p.variants);
              const price = priceLabel(p.variants);

              const cardBody = (
                <Card
                  className={cn(
                    'overflow-hidden transition-transform',
                    !branchMismatch && 'active:scale-[0.99]',
                    orderState === 'paid' && 'ring-1 ring-emerald-500/25',
                    branchMismatch && 'opacity-50',
                  )}
                  aria-disabled={branchMismatch}
                  title={branchMismatch ? '선택한 자녀의 지점이 아닙니다' : undefined}
                >
                  <div className='relative h-36 w-full'>
                    <MealImage
                      src={p.image_url}
                      type='product'
                      alt={p.name}
                      fill
                      className='rounded-t-lg'
                    />
                    <div className='absolute top-2 left-2 flex flex-wrap gap-1.5'>
                      <span className='bg-background/80 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm'>
                        {mealTypeLabel(p.meal_type)}
                      </span>
                      {summary && (
                        <span className='bg-background/80 rounded-full px-2 py-0.5 text-xs font-medium backdrop-blur-sm'>
                          {summary}
                        </span>
                      )}
                      {orderState === 'paid' ? (
                        <span className='rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white shadow-sm'>
                          결제 완료
                        </span>
                      ) : orderState === 'pending' ? (
                        <span className='rounded-full bg-amber-500/95 px-2 py-0.5 text-xs font-medium text-white shadow-sm'>
                          결제 대기
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className='p-4'>
                    <h2 className='text-foreground truncate font-semibold'>{p.name}</h2>
                    {branchMismatch ? (
                      <p className='text-muted-foreground mt-1 text-sm'>
                        선택한 자녀의 지점이 아닙니다.
                      </p>
                    ) : orderState === 'paid' ? (
                      <div className='mt-1 space-y-0.5 text-sm'>
                        <p className='font-medium text-emerald-700 dark:text-emerald-400'>
                          결제가 완료된 옵션이 있습니다.
                        </p>
                        <p className='text-muted-foreground'>{price}</p>
                      </div>
                    ) : orderState === 'pending' ? (
                      <div className='mt-1 space-y-0.5 text-sm'>
                        <p className='font-medium text-amber-700 dark:text-amber-400'>
                          결제를 이어서 진행해 주세요.
                        </p>
                        <p className='text-muted-foreground'>{price}</p>
                      </div>
                    ) : (
                      <p className='text-muted-foreground mt-1 text-sm'>{price}</p>
                    )}
                  </div>
                </Card>
              );

              return (
                <li key={p.id}>
                  {branchMismatch ? (
                    cardBody
                  ) : (
                    <Link href={`/parent/meals/${p.id}?for=${encodeURIComponent(selectedId)}`}>
                      {cardBody}
                    </Link>
                  )}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
