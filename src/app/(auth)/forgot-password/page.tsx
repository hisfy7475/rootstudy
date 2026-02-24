'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, ArrowLeft, KeyRound, Check, Send, ShieldCheck, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { resetPassword, verifyResetCode, resetUpdatePassword } from '../actions';

type Step = 'email' | 'code' | 'password' | 'done';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    if (result.success) {
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

    setIsLoading(true);
    setError(null);

    const result = await resetUpdatePassword(newPassword);

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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-success/20 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">비밀번호 변경 완료</CardTitle>
            <CardDescription>
              새로운 비밀번호로 로그인해주세요
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/login" className="w-full">
              <Button className="w-full" size="lg">
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">새 비밀번호 설정</CardTitle>
            <CardDescription>
              사용할 새 비밀번호를 입력해주세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호 (6자 이상)"
                  className="pl-12"
                  disabled={isLoading}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호 확인"
                  className="pl-12"
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdatePassword();
                  }}
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-error/10 text-error text-sm text-center">
                  {error}
                </div>
              )}

              <Button
                onClick={handleUpdatePassword}
                className="w-full"
                size="lg"
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
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">인증 코드 입력</CardTitle>
            <CardDescription>
              <span className="font-medium text-text">{email}</span>
              <span className="block mt-1">으로 발송된 6자리 코드를 입력해주세요</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex justify-center gap-2">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    className="w-12 h-14 text-center text-xl font-bold border-2 rounded-xl
                      focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none
                      transition-all bg-background"
                    disabled={isLoading}
                  />
                ))}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-error/10 text-error text-sm text-center">
                  {error}
                </div>
              )}

              <Button
                onClick={handleVerifyCode}
                className="w-full"
                size="lg"
                disabled={isLoading || code.join('').length !== 6}
              >
                {isLoading ? '확인 중...' : '인증 확인'}
              </Button>

              <div className="text-center">
                <p className="text-sm text-text-muted mb-2">
                  이메일이 도착하지 않았나요?
                </p>
                <button
                  onClick={handleResendCode}
                  disabled={isLoading}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link
            href="/login"
            className="absolute left-6 top-6 p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-text-muted" />
          </Link>
          <div className="mx-auto mb-4 w-16 h-16 bg-warning/20 rounded-full flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-warning" />
          </div>
          <CardTitle className="text-2xl">비밀번호 찾기</CardTitle>
          <CardDescription>
            가입한 이메일로 인증 코드를 보내드립니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSendCode} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="가입한 이메일"
                className="pl-12"
                required
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-error/10 text-error text-sm text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full gap-2"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                '발송 중...'
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  인증 코드 받기
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <span className="text-sm text-text-muted">
            비밀번호가 기억나셨나요?{' '}
            <Link href="/login" className="text-primary hover:underline">
              로그인
            </Link>
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
