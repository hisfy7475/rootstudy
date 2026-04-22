import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getLinkedStudents } from "@/lib/actions/parent";
import { getMealProducts, getMealActiveOrderStatusByStudentIds } from "@/lib/actions/meal";
import { ParentMockExamsClient } from "./mock-exams-client";

export default async function ParentMockExamsPage() {
  const [products, students] = await Promise.all([getMealProducts("exam"), getLinkedStudents()]);
  const studentIds = students.map((s) => s.id);
  const orderStatusByStudentId =
    studentIds.length > 0 ? await getMealActiveOrderStatusByStudentIds(studentIds) : {};

  return (
    <div className='px-4 pt-4'>
      <div className='flex items-center justify-between mb-1'>
        <h1 className='text-xl font-bold text-foreground'>모의고사 신청</h1>
        <Link
          href='/parent/mock-exams/orders'
          className='inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline'
        >
          <ClipboardList className='size-4' />
          신청 내역
        </Link>
      </div>
      <p className='text-sm text-muted-foreground mb-6'>자녀를 선택한 뒤 모의고사를 고르세요.</p>
      <ParentMockExamsClient
        initialProducts={products}
        students={students}
        orderStatusByStudentId={orderStatusByStudentId}
      />
    </div>
  );
}
