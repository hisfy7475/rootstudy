'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { MealImage } from '@/components/shared/meal-image';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MealProduct } from '@/types/database';

type StatusFilter = 'all' | 'active' | 'inactive' | 'sold_out';

const statusLabel: Record<MealProduct['status'], string> = {
  active: '판매중',
  inactive: '비활성',
  sold_out: '마감',
};

const tabs: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '판매중' },
  { key: 'inactive', label: '비활성' },
  { key: 'sold_out', label: '마감' },
];

interface AdminMealsClientProps {
  initialProducts: MealProduct[];
}

export function AdminMealsClient({ initialProducts }: AdminMealsClientProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return initialProducts;
    return initialProducts.filter((p) => p.status === filter);
  }, [initialProducts, filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">급식 관리</h1>
          <p className="text-muted-foreground mt-1 text-sm">상품 등록·메뉴·신청 현황</p>
        </div>
        <Link
          href="/admin/meals/new"
          className={cn(
            'inline-flex items-center justify-center gap-0 rounded-2xl font-medium transition-all duration-200',
            'bg-primary text-white shadow-sm hover:bg-primary/90 hover:shadow-md',
            'focus:ring-primary px-5 py-2.5 text-base focus:ring-2 focus:ring-offset-2 focus:outline-none'
          )}
        >
          <Plus className="mr-2 size-4" />
          상품 등록
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-left">
              <tr>
                <th className="p-3 font-medium w-16"></th>
                <th className="p-3 font-medium">이름</th>
                <th className="p-3 font-medium">유형</th>
                <th className="p-3 font-medium">가격</th>
                <th className="p-3 font-medium">판매 기간</th>
                <th className="p-3 font-medium">식사 기간</th>
                <th className="p-3 font-medium">정원</th>
                <th className="p-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-muted-foreground p-8 text-center">
                    등록된 상품이 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="h-10 w-10 overflow-hidden rounded-md">
                        <MealImage
                          src={p.image_url}
                          type="product"
                          alt={p.name}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-md"
                        />
                      </div>
                    </td>
                    <td className="p-3">
                      <Link href={`/admin/meals/${p.id}`} className="text-primary font-medium hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="p-3">{p.meal_type === 'lunch' ? '중식' : '석식'}</td>
                    <td className="p-3">{p.price.toLocaleString()}원</td>
                    <td className="p-3 whitespace-nowrap">
                      {p.sale_start_date} ~ {p.sale_end_date}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {p.meal_start_date} ~ {p.meal_end_date}
                    </td>
                    <td className="p-3">{p.max_capacity == null ? '무제한' : `${p.max_capacity}명`}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          p.status === 'active' && 'bg-emerald-100 text-emerald-800',
                          p.status === 'inactive' && 'bg-slate-100 text-slate-700',
                          p.status === 'sold_out' && 'bg-amber-100 text-amber-900'
                        )}
                      >
                        {statusLabel[p.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
