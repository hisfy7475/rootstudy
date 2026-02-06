'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, LogOut } from 'lucide-react';
import { signOut } from '@/app/(auth)/actions';

export default function PendingApprovalPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center">
            <Clock className="w-10 h-10 text-yellow-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">가입 승인 대기중</h1>
          <p className="text-text-muted leading-relaxed">
            회원가입이 완료되었습니다.<br />
            관리자의 승인을 기다리고 있습니다.<br />
            승인이 완료되면 모든 기능을 이용할 수 있습니다.
          </p>
        </div>

        <div className="pt-4">
          <Button
            variant="outline"
            onClick={() => signOut()}
            className="gap-2"
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </Button>
        </div>
      </Card>
    </div>
  );
}
