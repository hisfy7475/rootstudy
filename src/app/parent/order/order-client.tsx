'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import type { MealOrderWithProduct, MealProductWithVariants } from '@/lib/actions/meal';

type Student = { id: string; name: string; branchId: string | null };

function flatten(products: MealProductWithVariants[]): OrderVariantCardItem[] {
  return products.flatMap((p) => p.variants.map((v) => ({ product: p, variant: v })));
}

export function ParentOrderClient({
  initialTab,
  initialCategory,
  mealProducts,
  examProducts,
  mealOrders,
  examOrders,
  students,
}: {
  initialTab: OrderTab;
  initialCategory: OrderCategory;
  mealProducts: MealProductWithVariants[];
  examProducts: MealProductWithVariants[];
  mealOrders: MealOrderWithProduct[];
  examOrders: MealOrderWithProduct[];
  students: Student[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const tab = initialTab;
  const category = initialCategory;

  // null = "전체 자녀". 자녀 1명이면 그 자녀로 고정, 다명이면 첫 자녀가 default.
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    students[0]?.id ?? null,
  );
  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null;
  const selectedBranchId = selectedStudent?.branchId ?? null;
  const showAllOption = students.length >= 2;
  const studentNameById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s.name])),
    [students],
  );

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
    let filtered = category === 'all' ? all : all.filter((o) => o.product?.category === category);
    if (selectedStudentId) {
      filtered = filtered.filter((o) => o.student_id === selectedStudentId);
    }
    return filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [mealOrders, examOrders, category, selectedStudentId]);

  const hrefFor = (item: OrderVariantCardItem): string => {
    const base = item.product.category === 'exam' ? '/parent/mock-exams' : '/parent/meals';
    const studentId = selectedStudentId ?? '';
    const params = new URLSearchParams({
      for: studentId,
      variant: item.variant.id,
    });
    return `${base}/${item.product.id}?${params.toString()}`;
  };

  const disabledFor = (item: OrderVariantCardItem) => {
    if (selectedBranchId == null) return { disabled: false };
    if (item.product.branch_id !== selectedBranchId) {
      return { disabled: true, label: '다른 지점 상품' };
    }
    return { disabled: false };
  };

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
              onClick={() => setSelectedStudentId(s.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                selectedStudentId === s.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-foreground',
              )}
            >
              {s.name}
            </button>
          ))}
          {showAllOption && (
            <button
              type='button'
              onClick={() => setSelectedStudentId(null)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                selectedStudentId === null
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-foreground',
              )}
            >
              전체 자녀
            </button>
          )}
        </div>
      </Card>

      <OrderTabs value={tab} onChange={(t) => updateParams({ tab: t })} />
      <OrderCategoryChips value={category} onChange={(c) => updateParams({ category: c })} />

      {tab === 'apply' ? (
        selectedStudent ? (
          <OrderVariantGrid items={items} hrefFor={hrefFor} disabledFor={disabledFor} />
        ) : (
          <Card className='text-muted-foreground p-6 text-center text-sm'>
            신청할 자녀를 먼저 선택해 주세요.
          </Card>
        )
      ) : (
        <UserOrdersClient
          initialOrders={orders}
          studentNameById={selectedStudentId === null ? studentNameById : undefined}
        />
      )}
    </div>
  );
}
