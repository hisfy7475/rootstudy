import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  getMealProductDetail,
  getMealMenus,
  getPaidOrderCountForProduct,
  getExistingPendingOrder,
  getExistingPaidOrder,
} from '@/lib/actions/meal';
import { createClient } from '@/lib/supabase/server';
import { ProductDetailClient } from './product-detail-client';

export default async function StudentMealProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = await getMealProductDetail(productId);
  if (!product) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const studentId = user?.id ?? null;

  const [menus, paidCount, pendingOrder, paidOrder] = await Promise.all([
    getMealMenus(productId),
    getPaidOrderCountForProduct(productId),
    studentId ? getExistingPendingOrder(productId, studentId) : Promise.resolve(null),
    studentId ? getExistingPaidOrder(productId, studentId) : Promise.resolve(null),
  ]);

  const capacityLeft =
    product.max_capacity != null ? Math.max(0, product.max_capacity - paidCount) : null;

  return (
    <div className="px-4 pt-2 pb-6">
      <Link
        href="/student/meals"
        className="inline-flex items-center text-sm text-muted-foreground mb-3 gap-1"
      >
        <ChevronLeft className="w-4 h-4" />
        목록
      </Link>
      <ProductDetailClient
        product={product}
        menus={menus}
        capacityLeft={capacityLeft}
        payBasePath="/student/meals/pay"
        studentId={studentId}
        backHref="/student/meals"
        pendingOrder={pendingOrder}
        paidOrder={paidOrder}
      />
    </div>
  );
}
