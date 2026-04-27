'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { MealImage } from '@/components/shared/meal-image';
import type { MealProduct, MealProductVariant } from '@/types/database';
import { cn } from '@/lib/utils';

type ProductWithVariants = MealProduct & { variants: MealProductVariant[] };

function priceLabel(variants: MealProductVariant[]): string {
  if (variants.length === 0) return '-';
  return `${variants[0].price.toLocaleString('ko-KR')}원`;
}

export function MockExamsListClient({
  initialProducts,
  basePath,
  orderStatusByProductId = {},
}: {
  initialProducts: ProductWithVariants[];
  basePath: string;
  orderStatusByProductId?: Record<string, 'pending' | 'paid'>;
}) {
  if (initialProducts.length === 0) {
    return (
      <Card className='text-muted-foreground p-6 text-center text-sm'>
        현재 신청 가능한 모의고사가 없습니다.
      </Card>
    );
  }

  return (
    <ul className='space-y-3'>
      {initialProducts.map((p) => {
        const orderState = orderStatusByProductId[p.id];
        const price = priceLabel(p.variants);
        return (
          <li key={p.id}>
            <Link href={`${basePath}/${p.id}`}>
              <Card
                className={cn(
                  'overflow-hidden transition-transform active:scale-[0.99]',
                  orderState === 'paid' && 'ring-1 ring-emerald-500/25',
                )}
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
                  {orderState === 'paid' ? (
                    <div className='mt-1 space-y-0.5 text-sm'>
                      <p className='font-medium text-emerald-700 dark:text-emerald-400'>
                        결제가 완료된 모의고사입니다.
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
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
