import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  getExistingPendingOrder,
  getMockExamOptionGroups,
  getVariantForPayment,
} from '@/lib/actions/meal';
import { getUserScope } from '@/lib/auth/scope';
import {
  decodeOptionSelectionsParam,
  mapOptionInputsToSnapshots,
  parseOptionSelections,
} from '@/lib/mock-exam-options';
import { PayClient } from '@/components/shared/payment/pay-client';

export default async function StudentMockExamPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ variantId: string }>;
  searchParams: Promise<{ opts?: string }>;
}) {
  const { variantId } = await params;
  const { opts } = await searchParams;
  const info = await getVariantForPayment(variantId);
  if (!info || info.category !== 'exam') notFound();

  const scope = await getUserScope();
  if (!scope) notFound();

  const inputs = decodeOptionSelectionsParam(opts);
  const groups = await getMockExamOptionGroups(info.productId);
  let optionSelections = mapOptionInputsToSnapshots(groups, inputs);
  if (optionSelections.length === 0) {
    // 이어서 결제(resume) 등 opts 가 없는 진입: 기존 미완료 주문의 옵션 스냅샷으로 표시.
    const existing = await getExistingPendingOrder(variantId, scope.userId);
    if (existing) optionSelections = parseOptionSelections(existing.option_selections);
  }

  const backHref = `/student/mock-exams/${info.productId}`;

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
        category='exam'
        variantId={info.variantId}
        studentId={scope.userId}
        optionSelectionsInput={inputs}
        displayAmount={info.price}
        displayGoodsName={info.productName}
        optionSelections={optionSelections}
      />
    </div>
  );
}
