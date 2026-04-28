'use client';

import { Card } from '@/components/ui/card';
import { OrderVariantCard, type OrderVariantCardItem } from './order-variant-card';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatHeader(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(`${dateStr}T00:00:00+09:00`);
  const dow = WEEKDAY_KO[date.getUTCDay()] ?? '';
  return `${y}.${m}.${d} (${dow})`;
}

function compareItems(a: OrderVariantCardItem, b: OrderVariantCardItem): number {
  const dateDiff = a.variant.product_start_date.localeCompare(b.variant.product_start_date);
  if (dateDiff !== 0) return dateDiff;
  // lunch 먼저 → dinner
  const am = a.product.meal_type ?? '';
  const bm = b.product.meal_type ?? '';
  const mealDiff = am.localeCompare(bm);
  if (mealDiff !== 0) return mealDiff;
  // recurring 먼저
  if (a.variant.kind !== b.variant.kind) {
    return a.variant.kind === 'recurring' ? -1 : 1;
  }
  return a.product.name.localeCompare(b.product.name, 'ko');
}

function groupByDate(items: OrderVariantCardItem[]): Array<[string, OrderVariantCardItem[]]> {
  const map = new Map<string, OrderVariantCardItem[]>();
  for (const it of items) {
    const key = it.variant.product_start_date;
    const list = map.get(key);
    if (list) list.push(it);
    else map.set(key, [it]);
  }
  return Array.from(map.entries());
}

export function OrderVariantGrid({
  items,
  hrefFor,
  disabledFor,
  emptyMessage = '현재 신청 가능한 항목이 없습니다.',
}: {
  items: OrderVariantCardItem[];
  hrefFor: (item: OrderVariantCardItem) => string;
  disabledFor?: (item: OrderVariantCardItem) => { disabled: boolean; label?: string };
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <Card className='text-muted-foreground p-6 text-center text-sm'>{emptyMessage}</Card>;
  }

  const sorted = [...items].sort(compareItems);
  const grouped = groupByDate(sorted);

  return (
    <div className='space-y-6'>
      {grouped.map(([dateStr, list]) => (
        <section key={dateStr} className='space-y-3'>
          <h2 className='text-foreground text-base font-bold'>{formatHeader(dateStr)}</h2>
          <div className='grid grid-cols-3 gap-3'>
            {list.map((item) => {
              const dis = disabledFor?.(item);
              return (
                <OrderVariantCard
                  key={item.variant.id}
                  item={item}
                  href={hrefFor(item)}
                  disabled={dis?.disabled}
                  disabledLabel={dis?.label}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export type { OrderVariantCardItem };
