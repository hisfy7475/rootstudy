import { getMealOrders } from '@/lib/actions/meal';
import { OrdersClient } from './orders-client';

export default async function StudentMealOrdersPage() {
  const orders = await getMealOrders();

  return (
    <div className="px-4 pt-4 pb-6">
      <h1 className="text-xl font-bold mb-1">급식 신청 내역</h1>
      <p className="text-sm text-muted-foreground mb-6">결제 및 취소 상태를 확인하세요.</p>
      <OrdersClient initialOrders={orders} />
    </div>
  );
}
