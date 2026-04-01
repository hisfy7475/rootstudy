import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getMealOrderById } from '@/lib/actions/meal';
import { buildMealPaymentWindowParams } from '@/lib/nicepay';
import { PayClient } from './pay-client';

export default async function StudentMealPayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await getMealOrderById(orderId);
  if (!order || order.status !== 'pending') notFound();

  const product = Array.isArray(order.meal_products)
    ? order.meal_products[0]
    : order.meal_products;

  if (!product) notFound();

  const paymentInit = buildMealPaymentWindowParams({
    orderId: order.order_id,
    amount: order.amount,
    goodsName: product.name,
  });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';
  const returnUrl = `${baseUrl}/api/payments/nicepay/confirm`;

  return (
    <div className="px-4 pt-2 pb-6">
      <Link
        href={`/student/meals/${order.product_id}`}
        className="inline-flex items-center text-sm text-muted-foreground mb-3 gap-1"
      >
        <ChevronLeft className="w-4 h-4" />
        상품
      </Link>
      <PayClient
        paymentInit={paymentInit}
        returnUrl={returnUrl}
        mallReserved="s"
        backHref={`/student/meals/${order.product_id}`}
        mealRowId={order.id}
        displayAmount={order.amount}
        displayGoodsName={product.name}
      />
    </div>
  );
}
