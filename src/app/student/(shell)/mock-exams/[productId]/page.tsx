import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  getMealProductDetail,
  getPaidOrderCountForVariant,
  getExistingPendingOrder,
  getExistingPaidOrder,
} from '@/lib/actions/meal';
import { createClient } from '@/lib/supabase/server';
import { MockExamDetailClient } from './mock-exam-detail-client';
import type { MealOrder } from '@/types/database';

export default async function StudentMockExamProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = await getMealProductDetail(productId, 'exam');
  if (!product) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const studentId = user?.id ?? null;

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
        href='/student/mock-exams'
        className='text-muted-foreground mb-3 inline-flex items-center gap-1 text-sm'
      >
        <ChevronLeft className='h-4 w-4' />
        목록
      </Link>
      <MockExamDetailClient
        product={product}
        capacityLeftByVariant={capacityLeftByVariant}
        pendingOrderByVariant={pendingOrderByVariant}
        paidOrderByVariant={paidOrderByVariant}
        payBasePath='/student/mock-exams/pay'
        studentId={studentId}
        backHref='/student/mock-exams'
      />
    </div>
  );
}
