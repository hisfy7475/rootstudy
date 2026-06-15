import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getVariantForPayment } from '@/lib/actions/meal';
import { PayClient } from '@/components/shared/payment/pay-client';

export default async function ParentMealPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ variantId: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const { variantId } = await params;
  const { for: studentId } = await searchParams;
  const info = await getVariantForPayment(variantId);
  if (!info || info.category !== 'meal' || !studentId) notFound();

  const kindLabel = info.kind === 'recurring' ? '정기' : '일일';
  const goodsName = `${info.productName} · ${kindLabel}`;
  const backHref = `/parent/meals/${info.productId}?for=${encodeURIComponent(studentId)}`;

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
        mallReserved='p'
        backHref={backHref}
        category='meal'
        variantId={info.variantId}
        studentId={studentId}
        displayAmount={info.price}
        displayGoodsName={goodsName}
      />
    </div>
  );
}
