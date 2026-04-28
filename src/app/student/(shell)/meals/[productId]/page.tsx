import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  getMealProductDetail,
  getMealMenus,
  getPaidOrderCountForVariant,
  getExistingPendingOrder,
  getExistingPaidOrder,
} from '@/lib/actions/meal';
import { createClient } from '@/lib/supabase/server';
import { ProductDetailClient } from './product-detail-client';
import type { MealOrder } from '@/types/database';

export default async function StudentMealProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { productId } = await params;
  const { variant: initialVariantId } = await searchParams;
  const product = await getMealProductDetail(productId, 'meal');
  if (!product) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const studentId = user?.id ?? null;

  const menus = await getMealMenus(productId);

  const variantStats = await Promise.all(
    product.variants.map(async (v) => {
      const [paidCount, pending, paid] = await Promise.all([
        getPaidOrderCountForVariant(v.id),
        studentId ? getExistingPendingOrder(v.id, studentId) : Promise.resolve(null),
        studentId ? getExistingPaidOrder(v.id, studentId) : Promise.resolve(null),
      ]);
      return { variantId: v.id, paidCount, pending, paid };
    }),
  );

  const capacityLeftByVariant: Record<string, number | null> = {};
  const pendingOrderByVariant: Record<string, MealOrder | null> = {};
  const paidOrderByVariant: Record<string, MealOrder | null> = {};
  for (const v of product.variants) {
    const stat = variantStats.find((s) => s.variantId === v.id);
    capacityLeftByVariant[v.id] =
      v.max_capacity != null ? Math.max(0, v.max_capacity - (stat?.paidCount ?? 0)) : null;
    pendingOrderByVariant[v.id] = stat?.pending ?? null;
    paidOrderByVariant[v.id] = stat?.paid ?? null;
  }

  return (
    <div className='px-4 pt-2 pb-6'>
      <Link
        href='/student/order'
        className='text-muted-foreground mb-3 inline-flex items-center gap-1 text-sm'
      >
        <ChevronLeft className='h-4 w-4' />
        목록
      </Link>
      <ProductDetailClient
        product={product}
        menus={menus}
        capacityLeftByVariant={capacityLeftByVariant}
        pendingOrderByVariant={pendingOrderByVariant}
        paidOrderByVariant={paidOrderByVariant}
        payBasePath='/student/meals/pay'
        studentId={studentId}
        backHref='/student/order'
        initialVariantId={initialVariantId ?? null}
      />
    </div>
  );
}
