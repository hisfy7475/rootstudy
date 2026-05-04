'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, KeyRound, Lock, X } from 'lucide-react';
import { updateMyPassword } from '@/lib/actions/admin';

interface ChangePasswordModalProps {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validNew = newPassword.length >= 6;
  const matches = newPassword === confirmPassword;
  const canSubmit = currentPassword.length > 0 && validNew && matches && !success;

  const handleSubmit = async () => {
    if (!validNew) {
      setError('새 비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (!matches) {
      setError('새 비밀번호와 확인이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await updateMyPassword(currentPassword, newPassword);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || '비밀번호 변경에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to update password:', err);
      setError('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='w-full max-w-md space-y-5 p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-lg font-semibold'>
            <KeyRound className='text-primary h-5 w-5' />
            비밀번호 변경
          </h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        {success ? (
          <div className='space-y-4'>
            <div className='rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700'>
              비밀번호가 변경되었습니다.
            </div>
            <div className='flex justify-end'>
              <Button onClick={onClose}>확인</Button>
            </div>
          </div>
        ) : (
          <>
            <div className='space-y-4'>
              <div>
                <label className='mb-1.5 block text-sm font-medium'>
                  현재 비밀번호 <span className='text-red-500'>*</span>
                </label>
                <div className='relative'>
                  <Lock className='text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className='pl-10'
                    autoComplete='current-password'
                  />
                </div>
              </div>

              <div>
                <label className='mb-1.5 block text-sm font-medium'>
                  새 비밀번호 <span className='text-red-500'>*</span>
                </label>
                <div className='relative'>
                  <Lock className='text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder='최소 6자 이상'
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className='px-10'
                    autoComplete='new-password'
                  />
                  <button
                    type='button'
                    onClick={() => setShowPassword((v) => !v)}
                    className='text-text-muted absolute top-1/2 right-3 -translate-y-1/2 hover:text-gray-700'
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showPassword ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                  </button>
                </div>
              </div>

              <div>
                <label className='mb-1.5 block text-sm font-medium'>새 비밀번호 확인</label>
                <div className='relative'>
                  <Lock className='text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className='pl-10'
                    autoComplete='new-password'
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
                {error}
              </div>
            )}

            <div className='flex gap-3 pt-2'>
              <Button variant='outline' className='flex-1' onClick={onClose} disabled={loading}>
                취소
              </Button>
              <Button className='flex-1' onClick={handleSubmit} disabled={loading || !canSubmit}>
                {loading ? '변경 중...' : '비밀번호 변경'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
