'use client';

import { useMemo, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  OrderCategoryChips,
  type OrderCategory,
} from '@/components/shared/order/order-category-chips';
import { OrderTabs, type OrderTab } from '@/components/shared/order/order-tabs';
import {
  OrderVariantGrid,
  type OrderVariantCardItem,
} from '@/components/shared/order/order-variant-grid';
import { UserOrdersClient } from '@/components/shared/orders/user-orders-client';
import type { MealOrderWithProduct, MealProductWithVariants } from '@/lib/actions/meal';

function flatten(products: MealProductWithVariants[]): OrderVariantCardItem[] {
  return products.flatMap((p) => p.variants.map((v) => ({ product: p, variant: v })));
}

export function StudentOrderClient({
  initialTab,
  initialCategory,
  mealProducts,
  examProducts,
  mealOrders,
  examOrders,
}: {
  initialTab: OrderTab;
  initialCategory: OrderCategory;
  mealProducts: MealProductWithVariants[];
  examProducts: MealProductWithVariants[];
  mealOrders: MealOrderWithProduct[];
  examOrders: MealOrderWithProduct[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const tab = initialTab;
  const category = initialCategory;

  const updateParams = (next: Partial<{ tab: OrderTab; category: OrderCategory }>) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next.tab !== undefined) {
      if (next.tab === 'apply') sp.delete('tab');
      else sp.set('tab', next.tab);
    }
    if (next.category !== undefined) {
      if (next.category === 'all') sp.delete('category');
      else sp.set('category', next.category);
    }
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    });
  };

  const items = useMemo<OrderVariantCardItem[]>(() => {
    const all = [...flatten(mealProducts), ...flatten(examProducts)];
    if (category === 'all') return all;
    return all.filter((i) => i.product.category === category);
  }, [mealProducts, examProducts, category]);

  const orders = useMemo<MealOrderWithProduct[]>(() => {
    const all = [...mealOrders, ...examOrders];
    const filtered = category === 'all' ? all : all.filter((o) => o.product?.category === category);
    return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [mealOrders, examOrders, category]);

  const hrefFor = (item: OrderVariantCardItem): string => {
    const base = item.product.category === 'exam' ? '/student/mock-exams' : '/student/meals';
    return `${base}/${item.product.id}?variant=${item.variant.id}`;
  };

  return (
    <div className='space-y-4'>
      <OrderTabs value={tab} onChange={(t) => updateParams({ tab: t })} />
      <OrderCategoryChips value={category} onChange={(c) => updateParams({ category: c })} />
      {tab === 'apply' ? (
        <OrderVariantGrid items={items} hrefFor={hrefFor} />
      ) : (
        <UserOrdersClient initialOrders={orders} />
      )}
    </div>
  );
}
