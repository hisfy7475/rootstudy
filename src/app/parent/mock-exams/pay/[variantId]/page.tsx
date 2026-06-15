import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  getExistingPendingOrder,
  getMockExamOptionGroups,
  getVariantForPayment,
} from '@/lib/actions/meal';
import {
  decodeOptionSelectionsParam,
  mapOptionInputsToSnapshots,
  parseOptionSelections,
} from '@/lib/mock-exam-options';
import { PayClient } from '@/components/shared/payment/pay-client';

export default async function ParentMockExamPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ variantId: string }>;
  searchParams: Promise<{ for?: string; opts?: string }>;
}) {
  const { variantId } = await params;
  const { for: studentId, opts } = await searchParams;
  const info = await getVariantForPayment(variantId);
  if (!info || info.category !== 'exam' || !studentId) notFound();

  const inputs = decodeOptionSelectionsParam(opts);
  const groups = await getMockExamOptionGroups(info.productId);
  let optionSelections = mapOptionInputsToSnapshots(groups, inputs);
  if (optionSelections.length === 0) {
    const existing = await getExistingPendingOrder(variantId, studentId);
    if (existing) optionSelections = parseOptionSelections(existing.option_selections);
  }

  const backHref = `/parent/mock-exams/${info.productId}?for=${encodeURIComponent(studentId)}`;

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
        category='exam'
        variantId={info.variantId}
        studentId={studentId}
        optionSelectionsInput={inputs}
        displayAmount={info.price}
        displayGoodsName={info.productName}
        optionSelections={optionSelections}
      />
    </div>
  );
}
