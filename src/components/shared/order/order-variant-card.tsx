'use client';

import Link from 'next/link';
import { MealImage } from '@/components/shared/meal-image';
import { cn } from '@/lib/utils';
import type { MealProduct, MealProductVariant } from '@/types/database';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function mealTypeLabel(t: MealProduct['meal_type']): string | null {
  if (t === 'lunch') return '중식';
  if (t === 'dinner') return '석식';
  return null;
}

function formatRange(start: string, end: string): string {
  const startMd = formatMonthDay(start);
  const endMd = formatMonthDay(end);
  return `${startMd}~${endMd}`;
}

function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  const dow = weekdayKo(dateStr);
  return `${m}.${d}(${dow})`;
}

function weekdayKo(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00+09:00`);
  return WEEKDAY_KO[date.getUTCDay()] ?? '';
}

export type OrderVariantCardItem = {
  product: MealProduct;
  variant: MealProductVariant;
};

export function OrderVariantCard({
  item,
  href,
  disabled,
  disabledLabel,
}: {
  item: OrderVariantCardItem;
  href: string;
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const { product, variant } = item;
  const typeLabel = product.category === 'meal' ? mealTypeLabel(product.meal_type) : null;
  const isRecurring = variant.kind === 'recurring';
  const subtitle = isRecurring
    ? formatRange(variant.product_start_date, variant.product_end_date)
    : null;

  const body = (
    <div className={cn('space-y-2', disabled && 'opacity-50')}>
      <div className='bg-muted relative aspect-square w-full overflow-hidden rounded-lg'>
        <MealImage src={product.image_url} type='product' alt={product.name} fill />
      </div>
      <div className='space-y-0.5'>
        {typeLabel && (
          <span className='bg-muted text-foreground inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium'>
            {typeLabel}
          </span>
        )}
        {subtitle && <p className='text-foreground text-xs leading-tight'>{subtitle}</p>}
        <p className='text-foreground line-clamp-2 text-sm leading-tight font-medium'>
          {product.name}
        </p>
        <p className='text-foreground text-sm font-semibold'>
          {variant.price.toLocaleString('ko-KR')}원
        </p>
        {disabled && disabledLabel && (
          <p className='text-muted-foreground text-[11px]'>{disabledLabel}</p>
        )}
      </div>
    </div>
  );

  if (disabled) {
    return (
      <div aria-disabled title={disabledLabel ?? undefined}>
        {body}
      </div>
    );
  }

  return (
    <Link href={href} className='transition-opacity active:opacity-70'>
      {body}
    </Link>
  );
}
