import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getLinkedStudents } from '@/lib/actions/parent';
import {
  getMealProductDetail,
  getMealMenus,
  getPaidOrderCountForVariant,
  getExistingPendingOrder,
  getExistingPaidOrder,
} from '@/lib/actions/meal';
import { ProductDetailClient } from '@/app/student/(shell)/meals/[productId]/product-detail-client';
import type { MealOrder } from '@/types/database';

export default async function ParentMealProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const { productId } = await params;
  const sp = await searchParams;
  const forStudentId = sp.for;

  const students = await getLinkedStudents();
  const allowed = forStudentId && students.some((s) => s.id === forStudentId);
  if (!allowed) {
    redirect('/parent/meals');
  }

  const product = await getMealProductDetail(productId, 'meal');
  if (!product) notFound();

  const menus = await getMealMenus(productId);

  const variantStats = await Promise.all(
    product.variants.map(async (v) => {
      const [paidCount, pending, paid] = await Promise.all([
        getPaidOrderCountForVariant(v.id),
        getExistingPendingOrder(v.id, forStudentId!),
        getExistingPaidOrder(v.id, forStudentId!),
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
        href='/parent/meals'
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
        payBasePath='/parent/meals/pay'
        studentId={forStudentId!}
        backHref='/parent/meals'
      />
    </div>
  );
}
