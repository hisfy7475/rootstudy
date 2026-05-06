'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, LogOut, UserX, AlertTriangle } from 'lucide-react';
import { signOutWithNativeSync } from '@/lib/sign-out-app';
import { withdrawSelf } from '@/lib/actions/student';

export default function PendingApprovalPage() {
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawPassword, setWithdrawPassword] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenWithdraw() {
    setWithdrawPassword('');
    setWithdrawReason('');
    setWithdrawError(null);
    setIsWithdrawModalOpen(true);
  }

  function handleCloseWithdraw() {
    if (isPending) return;
    setIsWithdrawModalOpen(false);
  }

  function handleConfirmWithdraw() {
    setWithdrawError(null);
    if (!withdrawPassword) {
      setWithdrawError('현재 비밀번호를 입력해주세요.');
      return;
    }
    startTransition(async () => {
      const result = await withdrawSelf(withdrawPassword, withdrawReason);
      if (result.success) {
        await signOutWithNativeSync();
      } else {
        setWithdrawError(result.error || '회원 탈퇴에 실패했습니다.');
      }
    });
  }

  return (
    <div className='flex min-h-screen items-center justify-center px-4 py-8'>
      <Card className='w-full max-w-md space-y-6 p-8 text-center'>
        <div className='flex justify-center'>
          <div className='flex h-20 w-20 items-center justify-center rounded-full bg-yellow-100'>
            <Clock className='h-10 w-10 text-yellow-600' />
          </div>
        </div>

        <div className='space-y-2'>
          <h1 className='text-2xl font-bold'>가입 승인 대기중</h1>
          <p className='text-text-muted leading-relaxed'>
            회원가입이 완료되었습니다.
            <br />
            관리자의 승인을 기다리고 있습니다.
            <br />
            승인이 완료되면 모든 기능을 이용할 수 있습니다.
          </p>
        </div>

        <div className='flex flex-col gap-2 pt-4'>
          <Button variant='outline' onClick={() => void signOutWithNativeSync()} className='gap-2'>
            <LogOut className='h-4 w-4' />
            로그아웃
          </Button>
          <Button
            variant='outline'
            onClick={handleOpenWithdraw}
            className='gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'
          >
            <UserX className='h-4 w-4' />
            회원 탈퇴
          </Button>
        </div>
      </Card>

      {isWithdrawModalOpen && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4'
          onClick={handleCloseWithdraw}
        >
          <div
            className='w-full max-w-md rounded-2xl bg-white p-6 shadow-xl'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='mb-4 flex items-center gap-3'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full bg-red-100'>
                <AlertTriangle className='h-6 w-6 text-red-600' />
              </div>
              <div className='text-left'>
                <h3 className='text-lg font-bold'>회원 탈퇴</h3>
                <p className='text-text-muted text-xs'>가입을 취소하고 계정을 삭제합니다.</p>
              </div>
            </div>

            <div className='text-text-muted mb-4 space-y-2 rounded-xl bg-gray-50 p-3 text-left text-xs'>
              <p>· 탈퇴 후 본 계정으로 다시 로그인할 수 없습니다.</p>
              <p>· 동일한 이메일로 다시 가입하려면 데스크에 문의해 주세요.</p>
            </div>

            <div className='space-y-3 text-left'>
              <div>
                <label className='text-text-muted text-xs'>현재 비밀번호</label>
                <Input
                  type='password'
                  value={withdrawPassword}
                  onChange={(e) => setWithdrawPassword(e.target.value)}
                  placeholder='현재 비밀번호'
                  className='mt-1'
                  disabled={isPending}
                />
              </div>
              <div>
                <label className='text-text-muted text-xs'>탈퇴 사유 (선택)</label>
                <Input
                  type='text'
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  placeholder='개선에 참고하겠습니다'
                  className='mt-1'
                  disabled={isPending}
                />
              </div>
              {withdrawError && (
                <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>
                  {withdrawError}
                </div>
              )}
              <div className='flex gap-2 pt-2'>
                <Button
                  variant='outline'
                  className='flex-1'
                  onClick={handleCloseWithdraw}
                  disabled={isPending}
                >
                  취소
                </Button>
                <Button
                  className='flex-1 bg-red-600 text-white hover:bg-red-700'
                  onClick={handleConfirmWithdraw}
                  disabled={isPending}
                >
                  {isPending ? '처리 중...' : '탈퇴 확정'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
