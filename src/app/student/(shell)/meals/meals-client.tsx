'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { MealImage } from '@/components/shared/meal-image';
import type { MealProduct } from '@/types/database';
import { cn } from '@/lib/utils';

function mealTypeLabel(t: MealProduct['meal_type']): string {
  return t === 'lunch' ? '중식' : '석식';
}

export function MealsListClient({
  initialProducts,
  basePath,
  orderStatusByProductId = {},
}: {
  initialProducts: MealProduct[];
  basePath: string;
  /** product_id → 본인(또는 선택 자녀) 기준 진행 중 주문 */
  orderStatusByProductId?: Record<string, 'pending' | 'paid'>;
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
      {initialProducts.map((p) => {
        const orderState = orderStatusByProductId[p.id];
        return (
          <li key={p.id}>
            <Link href={`${basePath}/${p.id}`}>
              <Card
                className={cn(
                  'overflow-hidden active:scale-[0.99] transition-transform',
                  orderState === 'paid' && 'ring-1 ring-emerald-500/25'
                )}
              >
                <div className="relative h-36 w-full">
                  <MealImage
                    src={p.image_url}
                    type="product"
                    alt={p.name}
                    fill
                    className="rounded-t-lg"
                  />
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-background/80 backdrop-blur-sm">
                      {mealTypeLabel(p.meal_type)}
                    </span>
                    {orderState === 'paid' ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-sm">
                        결제 완료
                      </span>
                    ) : orderState === 'pending' ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/95 text-white shadow-sm">
                        결제 대기
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="p-4">
                  <h2 className="font-semibold text-foreground truncate">{p.name}</h2>
                  {orderState === 'paid' ? (
                    <div className="mt-1 space-y-0.5 text-sm">
                      <p className="font-medium text-emerald-700 dark:text-emerald-400">
                        결제가 완료된 급식입니다.
                      </p>
                      <p className="text-muted-foreground">
                        {p.price.toLocaleString('ko-KR')}원 · 판매 {p.sale_start_date} ~{' '}
                        {p.sale_end_date}
                      </p>
                    </div>
                  ) : orderState === 'pending' ? (
                    <div className="mt-1 space-y-0.5 text-sm">
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        결제를 이어서 진행해 주세요.
                      </p>
                      <p className="text-muted-foreground">
                        {p.price.toLocaleString('ko-KR')}원 · 판매 {p.sale_start_date} ~{' '}
                        {p.sale_end_date}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      {p.price.toLocaleString('ko-KR')}원 · 판매 {p.sale_start_date} ~ {p.sale_end_date}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
