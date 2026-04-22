import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getLinkedStudents } from "@/lib/actions/parent";
import {
  getMealProductDetail,
  getPaidOrderCountForProduct,
  getExistingPendingOrder,
  getExistingPaidOrder,
} from "@/lib/actions/meal";
import { MockExamDetailClient } from "@/app/student/(shell)/mock-exams/[productId]/mock-exam-detail-client";

export default async function ParentMockExamProductPage({
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
    redirect("/parent/mock-exams");
  }

  const product = await getMealProductDetail(productId, "exam");
  if (!product) notFound();

  const [paidCount, pendingOrder, paidOrder] = await Promise.all([
    getPaidOrderCountForProduct(productId),
    getExistingPendingOrder(productId, forStudentId!),
    getExistingPaidOrder(productId, forStudentId!),
  ]);

  const capacityLeft =
    product.max_capacity != null ? Math.max(0, product.max_capacity - paidCount) : null;

  return (
    <div className='px-4 pt-2 pb-6'>
      <Link
        href='/parent/mock-exams'
        className='inline-flex items-center text-sm text-muted-foreground mb-3 gap-1'
      >
        <ChevronLeft className='w-4 h-4' />
        목록
      </Link>
      <MockExamDetailClient
        product={product}
        capacityLeft={capacityLeft}
        payBasePath={`/parent/mock-exams/pay`}
        studentId={forStudentId!}
        backHref='/parent/mock-exams'
        pendingOrder={pendingOrder}
        paidOrder={paidOrder}
      />
    </div>
  );
}
