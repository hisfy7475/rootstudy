import { getLinkedStudents } from '@/lib/actions/parent';
import { getMealProducts } from '@/lib/actions/meal';
import { ParentMealsClient } from './meals-client';

export default async function ParentMealsPage() {
  const [products, students] = await Promise.all([getMealProducts(), getLinkedStudents()]);

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-bold text-foreground mb-1">급식 신청</h1>
      <p className="text-sm text-muted-foreground mb-6">자녀를 선택한 뒤 급식 상품을 고르세요.</p>
      <ParentMealsClient initialProducts={products} students={students} />
    </div>
  );
}
