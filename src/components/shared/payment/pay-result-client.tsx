'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * 결제 결과 페이지 클라이언트 (meal/exam 공용).
 * `useSearchParams`를 사용하므로 호출 페이지는 반드시 <Suspense>로 감싸야 한다.
 */
export function PayResultClient({
  ordersHref,
  homeHref,
  homeLabel,
}: {
  ordersHref: string;
  homeHref: string;
  homeLabel: string;
}) {
  const sp = useSearchParams();
  const ok = sp.get('ok') === '1';
  const fail = sp.get('fail') === '1';
  const reason = sp.get('reason') ?? '';
  const code = sp.get('code') ?? '';
  const msg = sp.get('msg') ?? '';

  return (
    <div className='space-y-6'>
      <Card className='space-y-3 p-6 text-center'>
        {ok ? (
          <>
            <CheckCircle2 className='mx-auto h-14 w-14 text-green-600' />
            <h1 className='text-lg font-bold'>결제가 완료되었습니다</h1>
            <p className='text-muted-foreground text-sm'>신청 내역에서 확인할 수 있습니다.</p>
          </>
        ) : (
          <>
            <XCircle className='mx-auto h-14 w-14 text-red-500' />
            <h1 className='text-lg font-bold'>결제에 실패했습니다</h1>
            <p className='text-muted-foreground text-sm break-words'>
              {[reason, code, msg].filter(Boolean).join(' · ') || '다시 시도해 주세요.'}
            </p>
            {fail ? null : null}
          </>
        )}
      </Card>

      <div className='flex flex-col gap-2'>
        <Link
          href={ordersHref}
          className='bg-primary hover:bg-primary/90 inline-flex w-full items-center justify-center rounded-2xl px-5 py-2.5 text-base font-medium text-white shadow-sm transition-all hover:shadow-md'
        >
          신청 내역
        </Link>
        <Link
          href={homeHref}
          className='border-primary text-primary hover:bg-primary/10 inline-flex w-full items-center justify-center rounded-2xl border-2 bg-transparent px-5 py-2.5 text-base font-medium transition-all'
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
