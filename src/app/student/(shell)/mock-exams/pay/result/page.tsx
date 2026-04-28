import { Suspense } from 'react';
import { PayResultClient } from '@/components/shared/payment/pay-result-client';

export default function StudentMockExamPayResultPage() {
  return (
    <div className='px-4 pt-6 pb-8'>
      <Suspense
        fallback={
          <div className='text-muted-foreground py-10 text-center text-sm'>불러오는 중…</div>
        }
      >
        <PayResultClient
          ordersHref='/student/order?tab=orders&category=exam'
          homeHref='/student/order?category=exam'
          homeLabel='급식 · 모의고사'
        />
      </Suspense>
    </div>
  );
}
