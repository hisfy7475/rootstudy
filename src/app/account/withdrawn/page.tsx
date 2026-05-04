'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserX, LogOut } from 'lucide-react';
import { signOutWithNativeSync } from '@/lib/sign-out-app';

export default function WithdrawnAccountPage() {
  return (
    <div className='flex min-h-screen items-center justify-center px-4 py-8'>
      <Card className='w-full max-w-md space-y-6 p-8 text-center'>
        <div className='flex justify-center'>
          <div className='flex h-20 w-20 items-center justify-center rounded-full bg-gray-100'>
            <UserX className='h-10 w-10 text-gray-600' />
          </div>
        </div>

        <div className='space-y-2'>
          <h1 className='text-2xl font-bold'>비활성화된 계정입니다</h1>
          <p className='text-text-muted leading-relaxed'>
            이 계정은 더 이상 사용할 수 없습니다.
            <br />
            계정 복구가 필요하다면 다니던 지점 데스크에 문의해주세요.
          </p>
        </div>

        <div className='pt-4'>
          <Button variant='outline' onClick={() => void signOutWithNativeSync()} className='gap-2'>
            <LogOut className='h-4 w-4' />
            로그아웃
          </Button>
        </div>
      </Card>
    </div>
  );
}
