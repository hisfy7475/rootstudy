import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getMealProducts, getMealActiveOrderStatusForMealListStudent } from "@/lib/actions/meal";
import { MockExamsListClient } from "./mock-exams-client";

export default async function StudentMockExamsPage() {
  const [products, orderStatusByProductId] = await Promise.all([
    getMealProducts("exam"),
    getMealActiveOrderStatusForMealListStudent(),
  ]);

  return (
    <div className='px-4 pt-4'>
      <div className='flex items-center justify-between mb-1'>
        <h1 className='text-xl font-bold text-foreground'>모의고사 신청</h1>
        <Link
          href='/student/mock-exams/orders'
          className='inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline'
        >
          <ClipboardList className='size-4' />
          신청 내역
        </Link>
      </div>
      <p className='text-sm text-muted-foreground mb-6'>지점에서 신청 가능한 모의고사입니다.</p>
      <MockExamsListClient
        initialProducts={products}
        basePath='/student/mock-exams'
        orderStatusByProductId={orderStatusByProductId}
      />
    </div>
  );
}
