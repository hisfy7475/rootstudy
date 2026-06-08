'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, KeyRound, Check, Send, ShieldCheck, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { resetPassword, verifyResetCode, resetUpdatePassword } from '../actions';

type Step = 'email' | 'code' | 'password' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // OTP 검증으로 발급된 recovery 세션 토큰. 마지막 비밀번호 설정 단계에서 사용한다.
  // 메모리(state)에만 보관하고 localStorage/쿠키에 저장하지 않는다.
  const [recoveryTokens, setRecoveryTokens] = useState<{ access: string; refresh: string } | null>(
    null,
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 'code') {
      inputRefs.current[0]?.focus();
    }
  }, [step]);

  async function handleSendCode(formData: FormData) {
    setIsLoading(true);
    setError(null);

    const result = await resetPassword(formData);

    if (result.success) {
      setStep('code');
    } else {
      setError(result.error || '이메일 발송에 실패했습니다.');
    }
    setIsLoading(false);
  }

  async function handleVerifyCode() {
    const token = code.join('');
    if (token.length !== 6) {
      setError('6자리 인증 코드를 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await verifyResetCode(email, token);

    if (result.success && result.data?.recoveryAccessToken && result.data?.recoveryRefreshToken) {
      setRecoveryTokens({
        access: result.data.recoveryAccessToken,
        refresh: result.data.recoveryRefreshToken,
      });
      setStep('password');
    } else {
      setError(result.error || '인증에 실패했습니다.');
    }
    setIsLoading(false);
  }

  async function handleUpdatePassword() {
    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPassword.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (!recoveryTokens) {
      setError('인증 정보가 만료되었습니다. 처음부터 다시 시도해주세요.');
      setStep('email');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await resetUpdatePassword(
      newPassword,
      recoveryTokens.access,
      recoveryTokens.refresh,
    );

    if (result.success) {
      setStep('done');
    } else {
      setError(result.error || '비밀번호 변경에 실패했습니다.');
    }
    setIsLoading(false);
  }

  function handleCodeChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];

    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      digits.forEach((digit, i) => {
        if (index + i < 6) newCode[index + i] = digit;
      });
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter' && code.join('').length === 6) {
      handleVerifyCode();
    }
  }

  async function handleResendCode() {
    setIsLoading(true);
    setError(null);
    setCode(['', '', '', '', '', '']);
    // 재발송 시 이전 OTP로 받은 토큰은 무효화되므로 초기화한다.
    setRecoveryTokens(null);

    const formData = new FormData();
    formData.append('email', email);
    const result = await resetPassword(formData);

    if (result.success) {
      setError(null);
    } else {
      setError(result.error || '이메일 발송에 실패했습니다.');
    }
    setIsLoading(false);
  }

  if (step === 'done') {
    return (
      <div className='bg-background flex min-h-screen items-center justify-center p-4'>
        <Card className='w-full max-w-md'>
          <CardHeader className='text-center'>
            <div className='bg-success/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
              <Check className='text-success h-8 w-8' />
            </div>
            <CardTitle className='text-2xl'>비밀번호 변경 완료</CardTitle>
            <CardDescription>새로운 비밀번호로 로그인해주세요</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href='/login' className='w-full'>
              <Button className='w-full' size='lg'>
                로그인하러 가기
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className='bg-background flex min-h-screen items-center justify-center p-4'>
        <Card className='w-full max-w-md'>
          <CardHeader className='text-center'>
            <div className='bg-primary/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
              <Lock className='text-primary h-8 w-8' />
            </div>
            <CardTitle className='text-2xl'>새 비밀번호 설정</CardTitle>
            <CardDescription>사용할 새 비밀번호를 입력해주세요</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              <div className='relative'>
                <Lock className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='password'
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder='새 비밀번호 (6자 이상)'
                  className='pl-12'
                  disabled={isLoading}
                />
              </div>
              <div className='relative'>
                <Lock className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='password'
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder='비밀번호 확인'
                  className='pl-12'
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdatePassword();
                  }}
                />
              </div>

              {error && (
                <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>
                  {error}
                </div>
              )}

              <Button
                onClick={handleUpdatePassword}
                className='w-full'
                size='lg'
                disabled={isLoading}
              >
                {isLoading ? '변경 중...' : '비밀번호 변경'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'code') {
    return (
      <div className='bg-background flex min-h-screen items-center justify-center p-4'>
        <Card className='w-full max-w-md'>
          <CardHeader className='text-center'>
            <div className='bg-primary/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
              <ShieldCheck className='text-primary h-8 w-8' />
            </div>
            <CardTitle className='text-2xl'>인증 코드 입력</CardTitle>
            <CardDescription>
              <span className='text-text font-medium'>{email}</span>
              <span className='mt-1 block'>으로 발송된 6자리 코드를 입력해주세요</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-6'>
              <div className='flex justify-center gap-2'>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type='text'
                    inputMode='numeric'
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    className='focus:border-primary focus:ring-primary/20 bg-background h-14 w-12 rounded-xl border-2 text-center text-xl font-bold transition-all outline-none focus:ring-2'
                    disabled={isLoading}
                  />
                ))}
              </div>

              {error && (
                <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>
                  {error}
                </div>
              )}

              <Button
                onClick={handleVerifyCode}
                className='w-full'
                size='lg'
                disabled={isLoading || code.join('').length !== 6}
              >
                {isLoading ? '확인 중...' : '인증 확인'}
              </Button>

              <div className='text-center'>
                <p className='text-text-muted mb-2 text-sm'>이메일이 도착하지 않았나요?</p>
                <button
                  onClick={handleResendCode}
                  disabled={isLoading}
                  className='text-primary text-sm hover:underline disabled:opacity-50'
                >
                  인증 코드 다시 받기
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='bg-background flex min-h-screen items-center justify-center p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader className='text-center'>
          <Link
            href='/login'
            className='absolute top-6 left-6 rounded-xl p-2 transition-colors hover:bg-gray-100'
          >
            <ArrowLeft className='text-text-muted h-5 w-5' />
          </Link>
          <div className='bg-warning/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
            <KeyRound className='text-warning h-8 w-8' />
          </div>
          <CardTitle className='text-2xl'>비밀번호 찾기</CardTitle>
          <CardDescription>가입한 이메일로 인증 코드를 보내드립니다</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSendCode} className='space-y-4'>
            <div className='relative'>
              <Mail className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
              <Input
                type='email'
                name='email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder='가입한 이메일'
                className='pl-12'
                required
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>
                {error}
              </div>
            )}

            <Button type='submit' className='w-full gap-2' size='lg' disabled={isLoading}>
              {isLoading ? (
                '발송 중...'
              ) : (
                <>
                  <Send className='h-4 w-4' />
                  인증 코드 받기
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className='justify-center'>
          <span className='text-text-muted text-sm'>
            비밀번호가 기억나셨나요?{' '}
            <Link href='/login' className='text-primary hover:underline'>
              로그인
            </Link>
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
