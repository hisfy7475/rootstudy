'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, Key, Lock, Mail, UserMinus, X, Users } from 'lucide-react';
import {
  updateParentEmail,
  resetParentPassword,
  findDuplicateParentAccounts,
  withdrawDuplicateParentAccount,
  type DuplicateParentAccount,
} from '@/lib/actions/admin';

interface ParentAccountModalProps {
  parent: { id: string; name: string; email: string; phone: string | null };
  onClose: () => void;
  onSuccess: () => void;
}

export function ParentAccountModal({ parent, onClose, onSuccess }: ParentAccountModalProps) {
  // 이메일 변경
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  // 비밀번호 재설정
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // 중복 계정
  const [dups, setDups] = useState<DuplicateParentAccount[]>([]);
  const [dupsLoading, setDupsLoading] = useState(true);
  const [dupBusyId, setDupBusyId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadDuplicates() {
    setDupsLoading(true);
    const res = await findDuplicateParentAccounts(parent.id);
    if ('rows' in res) setDups(res.rows);
    setDupsLoading(false);
  }

  useEffect(() => {
    loadDuplicates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent.id]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const emailMatch = newEmail.trim().toLowerCase() === confirmEmail.trim().toLowerCase();
  const canChangeEmail = emailValid && emailMatch && !emailLoading;

  const pwValid = newPassword.length >= 6;
  const pwMatch = newPassword === confirmPassword;
  const canResetPw = pwValid && pwMatch && !pwLoading;

  async function handleChangeEmail() {
    setError(null);
    setNotice(null);
    if (!emailValid) return setError('올바른 이메일 형식이 아닙니다.');
    if (!emailMatch) return setError('이메일과 확인이 일치하지 않습니다.');
    setEmailLoading(true);
    try {
      const res = await updateParentEmail(parent.id, newEmail.trim());
      if ('success' in res && res.success) {
        setNotice(`로그인 이메일을 ${newEmail.trim()} (으)로 변경했습니다.`);
        setNewEmail('');
        setConfirmEmail('');
        onSuccess();
      } else {
        setError(('error' in res && res.error) || '이메일 변경에 실패했습니다.');
      }
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleResetPassword() {
    setError(null);
    setNotice(null);
    if (!pwValid) return setError('비밀번호는 6자 이상이어야 합니다.');
    if (!pwMatch) return setError('새 비밀번호와 확인이 일치하지 않습니다.');
    setPwLoading(true);
    try {
      const res = await resetParentPassword(parent.id, newPassword);
      if ('success' in res && res.success) {
        setNotice('비밀번호를 재설정했습니다. 안전한 채널로 전달해 주세요.');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(('error' in res && res.error) || '비밀번호 재설정에 실패했습니다.');
      }
    } finally {
      setPwLoading(false);
    }
  }

  async function handleWithdrawDuplicate(dupId: string) {
    setError(null);
    setNotice(null);
    setDupBusyId(dupId);
    try {
      const res = await withdrawDuplicateParentAccount(parent.id, dupId);
      if ('success' in res && res.success) {
        setNotice('중복 계정을 탈퇴 처리했습니다.');
        await loadDuplicates();
        onSuccess();
      } else {
        setError(('error' in res && res.error) || '중복 계정 정리에 실패했습니다.');
      }
    } finally {
      setDupBusyId(null);
    }
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-lg font-semibold'>
            <Key className='h-5 w-5 text-amber-600' />
            학부모 계정 관리
          </h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-1 rounded-xl border border-gray-200 bg-gray-50 p-4'>
          <p className='text-sm font-medium'>
            <strong>{parent.name}</strong>
          </p>
          <p className='text-text-muted text-xs'>현재 이메일: {parent.email}</p>
          <p className='text-text-muted text-xs'>전화번호: {parent.phone || '-'}</p>
        </div>

        {error && (
          <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
            {error}
          </div>
        )}
        {notice && (
          <div className='rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700'>
            {notice}
          </div>
        )}

        {/* 1. 로그인 이메일 변경 */}
        <section className='space-y-3'>
          <h3 className='flex items-center gap-1.5 text-sm font-semibold'>
            <Mail className='h-4 w-4 text-blue-600' />
            로그인 이메일 변경
          </h3>
          <Input
            type='email'
            placeholder='새 이메일'
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Input
            type='email'
            placeholder='새 이메일 확인'
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
          />
          <Button
            className='w-full bg-blue-600 text-white hover:bg-blue-700'
            onClick={handleChangeEmail}
            disabled={!canChangeEmail}
          >
            {emailLoading ? '변경 중...' : '이메일 변경'}
          </Button>
        </section>

        <div className='border-t' />

        {/* 2. 비밀번호 재설정 */}
        <section className='space-y-3'>
          <h3 className='flex items-center gap-1.5 text-sm font-semibold'>
            <Lock className='h-4 w-4 text-amber-600' />
            비밀번호 재설정
          </h3>
          <div className='relative'>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder='새 비밀번호 (6자 이상)'
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className='pr-10'
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
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder='새 비밀번호 확인'
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button
            className='w-full bg-amber-600 text-white hover:bg-amber-700'
            onClick={handleResetPassword}
            disabled={!canResetPw}
          >
            {pwLoading ? '재설정 중...' : '비밀번호 재설정'}
          </Button>
        </section>

        <div className='border-t' />

        {/* 3. 같은 전화번호 중복 계정 */}
        <section className='space-y-3'>
          <h3 className='flex items-center gap-1.5 text-sm font-semibold'>
            <Users className='h-4 w-4 text-gray-600' />
            같은 전화번호 다른 계정
          </h3>
          {dupsLoading ? (
            <p className='text-text-muted text-sm'>불러오는 중...</p>
          ) : dups.length === 0 ? (
            <p className='text-text-muted text-sm'>같은 전화번호의 다른 계정이 없습니다.</p>
          ) : (
            <ul className='space-y-2'>
              {dups.map((d) => (
                <li
                  key={d.id}
                  className='flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2.5 text-sm'
                >
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>{d.email || '(이메일 없음)'}</p>
                    <p className='text-text-muted text-xs'>연결 자녀 {d.childCount}명</p>
                  </div>
                  {d.childCount === 0 ? (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => handleWithdrawDuplicate(d.id)}
                      disabled={dupBusyId === d.id}
                      className='h-7 shrink-0 border-red-200 px-2 text-red-500 hover:bg-red-50 hover:text-red-600'
                    >
                      <UserMinus className='mr-1 h-3 w-3' />
                      {dupBusyId === d.id ? '정리 중...' : '탈퇴 정리'}
                    </Button>
                  ) : (
                    <span className='text-text-muted shrink-0 text-xs'>자녀 보유(병합 필요)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className='flex justify-end pt-2'>
          <Button variant='outline' onClick={onClose}>
            닫기
          </Button>
        </div>
      </Card>
    </div>
  );
}
