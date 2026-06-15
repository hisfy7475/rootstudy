import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getVariantForPayment } from '@/lib/actions/meal';
import { getUserScope } from '@/lib/auth/scope';
import { PayClient } from '@/components/shared/payment/pay-client';

export default async function StudentMealPayPage({
  params,
}: {
  params: Promise<{ variantId: string }>;
}) {
  const { variantId } = await params;
  const info = await getVariantForPayment(variantId);
  if (!info || info.category !== 'meal') notFound();

  const scope = await getUserScope();
  if (!scope) notFound();

  const kindLabel = info.kind === 'recurring' ? '정기' : '일일';
  const goodsName = `${info.productName} · ${kindLabel}`;
  const backHref = `/student/meals/${info.productId}`;

  return (
    <div className='px-4 pt-2 pb-6'>
      <Link
        href={backHref}
        className='text-muted-foreground mb-3 inline-flex items-center gap-1 text-sm'
      >
        <ChevronLeft className='h-4 w-4' />
        상품
      </Link>
      <PayClient
        mallReserved='s'
        backHref={backHref}
        category='meal'
        variantId={info.variantId}
        studentId={scope.userId}
        displayAmount={info.price}
        displayGoodsName={goodsName}
      />
    </div>
  );
}
