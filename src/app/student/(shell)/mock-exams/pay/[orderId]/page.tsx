import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getMealOrderById } from '@/lib/actions/meal';
import { buildMealPaymentWindowParams } from '@/lib/nicepay';
import { PayClient } from '@/components/shared/payment/pay-client';
import { parseOptionSelections } from '@/lib/mock-exam-options';

export default async function StudentMockExamPayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await getMealOrderById(orderId);
  if (!order || order.status !== 'pending') notFound();

  const product = order.product;
  const variant = order.variant;
  if (!product || !variant) notFound();

  const productId = variant.product_id ?? product.id;

  const paymentInit = buildMealPaymentWindowParams({
    orderId: order.order_id,
    amount: order.amount,
    goodsName: product.name,
  });

  const optionSelections = parseOptionSelections(order.option_selections);

  return (
    <div className='px-4 pt-2 pb-6'>
      <Link
        href={`/student/mock-exams/${productId}`}
        className='text-muted-foreground mb-3 inline-flex items-center gap-1 text-sm'
      >
        <ChevronLeft className='h-4 w-4' />
        상품
      </Link>
      <PayClient
        paymentInit={paymentInit}
        mallReserved='s'
        backHref={`/student/mock-exams/${productId}`}
        orderRowId={order.id}
        displayAmount={order.amount}
        displayGoodsName={product.name}
        optionSelections={optionSelections}
      />
    </div>
  );
}
