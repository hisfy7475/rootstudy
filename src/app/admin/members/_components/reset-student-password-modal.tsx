'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, Key, Lock, X } from 'lucide-react';
import { resetStudentPassword } from '@/lib/actions/admin';

interface ResetStudentPasswordModalProps {
  /** 로그인 아이디(email)를 반드시 보여준다 — 동명이인 오조작 방지의 1차 확인 수단. */
  student: {
    id: string;
    name: string;
    email: string;
    school: string | null;
    branchName: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function ResetStudentPasswordModal({
  student,
  onClose,
  onSuccess,
}: ResetStudentPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validPassword = newPassword.length >= 6;
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = validPassword && passwordsMatch && !loading;

  const handleSubmit = async () => {
    if (!validPassword) return setError('비밀번호는 6자 이상이어야 합니다.');
    if (!passwordsMatch) return setError('새 비밀번호와 확인이 일치하지 않습니다.');

    setLoading(true);
    setError(null);
    try {
      const res = await resetStudentPassword(student.id, newPassword);
      if ('success' in res && res.success) {
        onSuccess();
      } else {
        setError(('error' in res && res.error) || '비밀번호 재설정에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to reset student password:', err);
      setError('비밀번호 재설정 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-lg font-semibold'>
            <Key className='h-5 w-5 text-amber-600' />
            학생 비밀번호 재설정
          </h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4'>
          <p className='text-sm font-medium text-amber-800'>{student.name}</p>
          <p className='text-xs break-all text-amber-700'>로그인 아이디: {student.email}</p>
          <p className='text-xs text-amber-700'>
            {[student.school, student.branchName].filter(Boolean).join(' · ') || '-'}
          </p>
          <p className='pt-1 text-xs text-amber-700'>
            새 비밀번호가 즉시 적용됩니다. 학생 본인에게 직접 전달해 주세요.
          </p>
        </div>

        <div className='space-y-4'>
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
                placeholder='다시 입력'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className='pl-10'
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
          <Button
            className='flex-1 bg-amber-600 text-white hover:bg-amber-700'
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            <Key className='mr-1 h-4 w-4' />
            {loading ? '재설정 중...' : '비밀번호 재설정'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
