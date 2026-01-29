'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, KeyRound, Check, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { resetPassword } from '../actions';

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [email, setEmail] = useState('');

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);

    const result = await resetPassword(formData);

    if (result.success) {
      setIsEmailSent(true);
    } else {
      setError(result.error || '이메일 발송에 실패했습니다.');
    }
    setIsLoading(false);
  }

  // 이메일 발송 완료
  if (isEmailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-success/20 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">이메일 발송 완료</CardTitle>
            <CardDescription>
              비밀번호 재설정 링크를 발송했습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 rounded-2xl p-4 text-center mb-4">
              <div className="text-sm text-text-muted mb-1">발송된 이메일</div>
              <div className="font-medium text-text">{email}</div>
            </div>
            <p className="text-sm text-text-muted text-center">
              이메일을 확인하고 링크를 클릭하여<br />
              새로운 비밀번호를 설정해주세요.
            </p>
            <p className="mt-4 text-xs text-text-muted text-center">
              이메일이 도착하지 않았다면 스팸함을 확인해주세요.
            </p>
          </CardContent>
          <CardFooter>
            <Link href="/login" className="w-full">
              <Button variant="outline" className="w-full">
                로그인으로 돌아가기
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 비밀번호 찾기 폼
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
            가입한 이메일로 재설정 링크를 보내드립니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
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
                  재설정 링크 받기
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
