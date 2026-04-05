import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { getLinkedStudents } from '@/lib/actions/parent';
import { getMealProducts, getMealActiveOrderStatusByStudentIds } from '@/lib/actions/meal';
import { ParentMealsClient } from './meals-client';

export default async function ParentMealsPage() {
  const [products, students] = await Promise.all([getMealProducts(), getLinkedStudents()]);
  const studentIds = students.map((s) => s.id);
  const orderStatusByStudentId =
    studentIds.length > 0 ? await getMealActiveOrderStatusByStudentIds(studentIds) : {};

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-foreground">급식 신청</h1>
        <Link
          href="/parent/meals/orders"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ClipboardList className="size-4" />
          신청 내역
        </Link>
      </div>
      <p className="text-sm text-muted-foreground mb-6">자녀를 선택한 뒤 급식 상품을 고르세요.</p>
      <ParentMealsClient
        initialProducts={products}
        students={students}
        orderStatusByStudentId={orderStatusByStudentId}
      />
    </div>
  );
}
