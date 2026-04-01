'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { MealProduct } from '@/types/database';
import { UtensilsCrossed, Sun, Moon } from 'lucide-react';

function mealTypeLabel(t: MealProduct['meal_type']): string {
  return t === 'lunch' ? '중식' : '석식';
}

export function MealsListClient({
  initialProducts,
  basePath,
}: {
  initialProducts: MealProduct[];
  basePath: string;
}) {
  if (initialProducts.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground text-sm">
        현재 신청 가능한 급식이 없습니다.
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {initialProducts.map((p) => (
        <li key={p.id}>
          <Link href={`${basePath}/${p.id}`}>
            <Card className="p-4 active:scale-[0.99] transition-transform">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  {p.meal_type === 'lunch' ? (
                    <Sun className="w-5 h-5" />
                  ) : (
                    <Moon className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">
                      {mealTypeLabel(p.meal_type)}
                    </span>
                    <UtensilsCrossed className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </div>
                  <h2 className="font-semibold text-foreground mt-1 truncate">{p.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {p.price.toLocaleString('ko-KR')}원 · 판매 {p.sale_start_date} ~ {p.sale_end_date}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
