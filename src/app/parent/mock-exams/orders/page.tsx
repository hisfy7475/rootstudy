import { getMealOrders } from '@/lib/actions/meal';
import { UserOrdersClient } from '@/components/shared/orders/user-orders-client';

export default async function ParentMockExamOrdersPage() {
  const orders = await getMealOrders('exam');

  return (
    <div className='px-4 pt-4 pb-6'>
      <h1 className='mb-1 text-xl font-bold'>모의고사 신청 내역</h1>
      <p className='text-muted-foreground mb-6 text-sm'>자녀 모의고사 결제·취소 상태입니다.</p>
      <UserOrdersClient initialOrders={orders} category='exam' />
    </div>
  );
}
