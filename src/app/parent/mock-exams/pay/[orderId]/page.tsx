import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getMealOrderById } from '@/lib/actions/meal';
import { buildMealPaymentWindowParams } from '@/lib/nicepay';
import { PayClient } from '@/components/shared/payment/pay-client';

export default async function ParentMockExamPayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await getMealOrderById(orderId);
  if (!order || order.status !== 'pending') notFound();

  const product = Array.isArray(order.meal_products) ? order.meal_products[0] : order.meal_products;

  if (!product) notFound();

  const paymentInit = buildMealPaymentWindowParams({
    orderId: order.order_id,
    amount: order.amount,
    goodsName: product.name,
  });

  return (
    <div className='px-4 pt-2 pb-6'>
      <Link
        href={`/parent/mock-exams/${order.product_id}?for=${encodeURIComponent(order.student_id)}`}
        className='text-muted-foreground mb-3 inline-flex items-center gap-1 text-sm'
      >
        <ChevronLeft className='h-4 w-4' />
        상품
      </Link>
      <PayClient
        paymentInit={paymentInit}
        mallReserved='p'
        backHref={`/parent/mock-exams/${order.product_id}?for=${encodeURIComponent(order.student_id)}`}
        orderRowId={order.id}
        displayAmount={order.amount}
        displayGoodsName={product.name}
      />
    </div>
  );
}
