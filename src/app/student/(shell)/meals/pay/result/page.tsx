import { Suspense } from 'react';
import { PayResultClient } from '@/components/shared/payment/pay-result-client';

export default function StudentMealPayResultPage() {
  return (
    <div className='px-4 pt-6 pb-8'>
      <Suspense
        fallback={
          <div className='text-muted-foreground py-10 text-center text-sm'>불러오는 중…</div>
        }
      >
        <PayResultClient
          ordersHref='/student/meals/orders'
          homeHref='/student/meals'
          homeLabel='급식 목록'
        />
      </Suspense>
    </div>
  );
}
