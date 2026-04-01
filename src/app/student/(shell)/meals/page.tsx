import { getMealProducts } from '@/lib/actions/meal';
import { MealsListClient } from './meals-client';

export default async function StudentMealsPage() {
  const products = await getMealProducts();

  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-bold text-foreground mb-1">급식 신청</h1>
      <p className="text-sm text-muted-foreground mb-6">지점 판매 중인 급식 상품입니다.</p>
      <MealsListClient initialProducts={products} basePath="/student/meals" />
    </div>
  );
}
