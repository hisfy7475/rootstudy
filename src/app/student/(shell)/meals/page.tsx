import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { getMealProducts, getMealActiveOrderStatusForMealListStudent } from '@/lib/actions/meal';
import { MealsListClient } from './meals-client';

export default async function StudentMealsPage() {
  const [products, orderStatusByProductId] = await Promise.all([
    getMealProducts(),
    getMealActiveOrderStatusForMealListStudent(),
  ]);

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-foreground">급식 신청</h1>
        <Link
          href="/student/meals/orders"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ClipboardList className="size-4" />
          신청 내역
        </Link>
      </div>
      <p className="text-sm text-muted-foreground mb-6">지점 판매 중인 급식 상품입니다.</p>
      <MealsListClient
        initialProducts={products}
        basePath="/student/meals"
        orderStatusByProductId={orderStatusByProductId}
      />
    </div>
  );
}
