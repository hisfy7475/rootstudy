'use client';

import { Card } from '@/components/ui/card';
import type { MealProduct } from '@/types/database';
import { OrderVariantCard, type OrderVariantCardItem } from './order-variant-card';

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatHeader(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(`${dateStr}T12:00:00+09:00`);
  const dow = WEEKDAY_KO[date.getUTCDay()] ?? '';
  return `${y}.${m}.${d} (${dow})`;
}

// 식사 유형 노출 우선순위: 중식(lunch) → 석식(dinner) → 그 외(null 등)
function mealTypeRank(t: MealProduct['meal_type']): number {
  if (t === 'lunch') return 0;
  if (t === 'dinner') return 1;
  return 2;
}

function compareItems(a: OrderVariantCardItem, b: OrderVariantCardItem): number {
  const dateDiff = a.variant.product_start_date.localeCompare(b.variant.product_start_date);
  if (dateDiff !== 0) return dateDiff;
  // 같은 이용일자 그룹 내 1순위: 식사 유형 순(중식 → 석식 → 기타).
  // 도시락 여부와 무관하게 중식이 항상 석식보다 먼저 노출돼야 한다는 요구사항.
  const mealTypeDiff = mealTypeRank(a.product.meal_type) - mealTypeRank(b.product.meal_type);
  if (mealTypeDiff !== 0) return mealTypeDiff;
  // 식사 유형이 같으면 2순위: 도시락 메뉴(is_bento) 먼저(왼쪽).
  // → 석식 그룹 안에서 "석식(도시락)"이 "기타메뉴"보다 앞. undefined→NaN 방어로 ?? false.
  const bentoDiff = Number(b.product.is_bento ?? false) - Number(a.product.is_bento ?? false);
  if (bentoDiff !== 0) return bentoDiff;
  // 도시락 여부도 같으면: 상품 업로드 순서(created_at ASC) — 먼저 등록한 게 왼쪽
  const productDiff = a.product.created_at.localeCompare(b.product.created_at);
  if (productDiff !== 0) return productDiff;
  // 동일 상품의 여러 variant: variant 생성 순서
  return a.variant.created_at.localeCompare(b.variant.created_at);
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
