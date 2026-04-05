import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getLinkedStudents } from '@/lib/actions/parent';
import {
  getMealProductDetail,
  getMealMenus,
  getPaidOrderCountForProduct,
  getExistingPendingOrder,
  getExistingPaidOrder,
} from '@/lib/actions/meal';
import { ProductDetailClient } from '@/app/student/(shell)/meals/[productId]/product-detail-client';

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

  const product = await getMealProductDetail(productId);
  if (!product) notFound();

  const [menus, paidCount, pendingOrder, paidOrder] = await Promise.all([
    getMealMenus(productId),
    getPaidOrderCountForProduct(productId),
    getExistingPendingOrder(productId, forStudentId!),
    getExistingPaidOrder(productId, forStudentId!),
  ]);

  const capacityLeft =
    product.max_capacity != null ? Math.max(0, product.max_capacity - paidCount) : null;

  return (
    <div className="px-4 pt-2 pb-6">
      <Link
        href="/parent/meals"
        className="inline-flex items-center text-sm text-muted-foreground mb-3 gap-1"
      >
        <ChevronLeft className="w-4 h-4" />
        목록
      </Link>
      <ProductDetailClient
        product={product}
        menus={menus}
        capacityLeft={capacityLeft}
        payBasePath={`/parent/meals/pay`}
        studentId={forStudentId!}
        backHref="/parent/meals"
        pendingOrder={pendingOrder}
        paidOrder={paidOrder}
      />
    </div>
  );
}
