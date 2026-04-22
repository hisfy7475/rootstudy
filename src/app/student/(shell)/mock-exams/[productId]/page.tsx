import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getMealProductDetail,
  getPaidOrderCountForProduct,
  getExistingPendingOrder,
  getExistingPaidOrder,
} from "@/lib/actions/meal";
import { createClient } from "@/lib/supabase/server";
import { MockExamDetailClient } from "./mock-exam-detail-client";

export default async function StudentMockExamProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = await getMealProductDetail(productId, "exam");
  if (!product) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const studentId = user?.id ?? null;

  const [paidCount, pendingOrder, paidOrder] = await Promise.all([
    getPaidOrderCountForProduct(productId),
    studentId ? getExistingPendingOrder(productId, studentId) : Promise.resolve(null),
    studentId ? getExistingPaidOrder(productId, studentId) : Promise.resolve(null),
  ]);

  const capacityLeft =
    product.max_capacity != null ? Math.max(0, product.max_capacity - paidCount) : null;

  return (
    <div className='px-4 pt-2 pb-6'>
      <Link
        href='/student/mock-exams'
        className='inline-flex items-center text-sm text-muted-foreground mb-3 gap-1'
      >
        <ChevronLeft className='w-4 h-4' />
        목록
      </Link>
      <MockExamDetailClient
        product={product}
        capacityLeft={capacityLeft}
        payBasePath='/student/mock-exams/pay'
        studentId={studentId}
        backHref='/student/mock-exams'
        pendingOrder={pendingOrder}
        paidOrder={paidOrder}
      />
    </div>
  );
}
