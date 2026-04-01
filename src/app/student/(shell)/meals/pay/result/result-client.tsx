'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle } from 'lucide-react';

export function PayResultClient({
  ordersHref,
  homeHref,
}: {
  ordersHref: string;
  homeHref: string;
}) {
  const sp = useSearchParams();
  const ok = sp.get('ok') === '1';
  const fail = sp.get('fail') === '1';
  const reason = sp.get('reason') ?? '';
  const code = sp.get('code') ?? '';
  const msg = sp.get('msg') ?? '';

  return (
    <div className="space-y-6">
      <Card className="p-6 text-center space-y-3">
        {ok ? (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto" />
            <h1 className="text-lg font-bold">결제가 완료되었습니다</h1>
            <p className="text-sm text-muted-foreground">신청 내역에서 확인할 수 있습니다.</p>
          </>
        ) : (
          <>
            <XCircle className="w-14 h-14 text-red-500 mx-auto" />
            <h1 className="text-lg font-bold">결제에 실패했습니다</h1>
            <p className="text-sm text-muted-foreground break-words">
              {[reason, code, msg].filter(Boolean).join(' · ') || '다시 시도해 주세요.'}
            </p>
          </>
        )}
      </Card>

      <div className="flex flex-col gap-2">
        <Link
          href={ordersHref}
          className="inline-flex items-center justify-center font-medium transition-all rounded-2xl w-full px-5 py-2.5 text-base bg-primary text-white hover:bg-primary/90 shadow-sm hover:shadow-md"
        >
          신청 내역
        </Link>
        <Link
          href={homeHref}
          className="inline-flex items-center justify-center font-medium transition-all rounded-2xl w-full px-5 py-2.5 text-base border-2 border-primary text-primary bg-transparent hover:bg-primary/10"
        >
          급식 목록
        </Link>
      </div>
    </div>
  );
}
