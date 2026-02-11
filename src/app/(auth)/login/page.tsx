'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { signIn } from '../actions';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);

    const result = await signIn(formData);

    if (result.success) {
      router.push('/');
      router.refresh();
    } else {
      setError(result.error || '로그인에 실패했습니다.');
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Image
              src="/logo.png"
              alt="WHEVER STUDY route 관리형 독서실"
              width={200}
              height={80}
              className="object-contain"
              priority
            />
          </div>
          <CardDescription className="space-y-2">
            <span className="block font-bold text-foreground">
              철저한 관리와 몰입이 확실한 결과로 이어지는 프리미엄 학습 공간
            </span>
            <span className="block text-text-muted">
              학습시간 관리, 몰입도, 상벌점 시스템
            </span>
          </CardDescription>
          <CardTitle className="text-2xl mt-4">로그인 (회원 전용)</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                type="email"
                name="email"
                placeholder="이메일"
                className="pl-12"
                required
                disabled={isLoading}
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                type="password"
                name="password"
                placeholder="비밀번호"
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
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-text-muted hover:text-primary transition-colors"
            >
              비밀번호를 잊으셨나요?
            </Link>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <div className="w-full text-center text-sm text-text-muted">
            아직 계정이 없으신가요?
          </div>
          <div className="flex gap-3 w-full">
            <Link href="/signup/student" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <User className="w-4 h-4" />
                학생 가입
              </Button>
            </Link>
            <Link href="/signup/parent" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <Users className="w-4 h-4" />
                학부모 가입
              </Button>
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
