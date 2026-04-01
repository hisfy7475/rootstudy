import { getMealOrders } from '@/lib/actions/meal';
import { OrdersClient } from '@/app/student/(shell)/meals/orders/orders-client';

export default async function ParentMealOrdersPage() {
  const orders = await getMealOrders();

  return (
    <div className="px-4 pt-4 pb-6">
      <h1 className="text-xl font-bold mb-1">급식 신청 내역</h1>
      <p className="text-sm text-muted-foreground mb-6">자녀 급식 결제·취소 상태입니다.</p>
      <OrdersClient initialOrders={orders} />
    </div>
  );
}
