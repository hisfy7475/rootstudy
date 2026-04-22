import { getMealOrders } from "@/lib/actions/meal";
import { MockExamOrdersClient } from "@/app/student/(shell)/mock-exams/orders/orders-client";

export default async function ParentMockExamOrdersPage() {
  const orders = await getMealOrders("exam");

  return (
    <div className='px-4 pt-4 pb-6'>
      <h1 className='text-xl font-bold mb-1'>모의고사 신청 내역</h1>
      <p className='text-sm text-muted-foreground mb-6'>자녀 모의고사 결제·취소 상태입니다.</p>
      <MockExamOrdersClient initialOrders={orders} />
    </div>
  );
}
