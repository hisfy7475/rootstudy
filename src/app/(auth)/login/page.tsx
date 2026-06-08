'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { signIn } from '../actions';
import { setRememberCookie } from '@/lib/remember-me';

export default function LoginPage() {
  const router = useRouter();
  // 입력값을 controlled state로 관리. React 19의 form action 자동 reset에도
  // input은 state가 truth source라 초기화되지 않아 로그인 실패 시 입력값이 보존된다.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 기본값은 항상 ON. 이전 선택을 기억하지 않아 직전 OFF 사용자가 모르고 자동로그인되는 사고를 막는다.
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);

    // signIn 호출 전에 쿠키를 set해야 서버 액션 → 미들웨어 응답에서 Supabase 쿠키
    // 영속성 분기가 일관되게 적용된다.
    setRememberCookie(rememberMe);

    // state를 truth source로 직접 FormData 구성. <form action>이 아닌 onSubmit을 쓰는 이유는
    // React 19의 form action 자동 reset이 controlled checkbox 상태(rememberMe)까지
    // 초기화시키는 동작이 있어 입력값 보존을 깨뜨리기 때문이다.
    const fd = new FormData();
    fd.set('email', email);
    fd.set('password', password);

    const result = await signIn(fd);

    if (result.success) {
      router.push('/');
      router.refresh();
    } else {
      // 퇴원 처리된 계정은 안내 페이지로 이동시켜 사용자가 사유를 알 수 있게 한다.
      if (result.data?.redirect) {
        router.push(result.data.redirect);
        return;
      }
      setError(result.error || '로그인에 실패했습니다.');
      setIsLoading(false);
    }
  }

  return (
    <div className='bg-background flex min-h-screen items-center justify-center p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader className='text-center'>
          <div className='mx-auto mb-4'>
            <Image
              src='/logo.png'
              alt='WHEVER STUDY route 관리형 독서실'
              width={200}
              height={80}
              className='object-contain'
              priority
            />
          </div>
          <CardDescription className='space-y-1'>
            <span className='text-foreground block'>철저한 학습관리가 성적향상으로 이어지는</span>
            <span className='text-foreground block'>프리미엄 학습공간</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className='space-y-4'
          >
            <div className='relative'>
              <Mail className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
              <Input
                type='email'
                name='email'
                placeholder='이메일'
                className='pl-12'
                required
                disabled={isLoading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete='email'
              />
            </div>
            <PasswordInput
              name='password'
              placeholder='비밀번호'
              className='pl-12'
              required
              disabled={isLoading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete='current-password'
              leftIcon={
                <Lock className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
              }
            />

            <label className='flex cursor-pointer items-center gap-2 text-sm select-none'>
              <input
                type='checkbox'
                name='rememberMe'
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLoading}
                className='text-primary focus:ring-primary/30 h-4 w-4 rounded border-gray-300 focus:ring-2'
              />
              <span className='text-text'>자동로그인 유지</span>
            </label>

            {error && (
              <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>
                {error}
              </div>
            )}

            <Button type='submit' className='w-full' size='lg' disabled={isLoading}>
              {isLoading ? '로그인 중...' : '로그인 (회원 전용)'}
            </Button>
          </form>

          <div className='mt-4 text-center'>
            <Link
              href='/forgot-password'
              className='text-text-muted hover:text-primary text-sm transition-colors'
            >
              비밀번호를 잊으셨나요?
            </Link>
          </div>
        </CardContent>
        <CardFooter className='flex flex-col gap-3'>
          <div className='text-text-muted w-full text-center text-sm'>아직 계정이 없으신가요?</div>
          <div className='flex w-full gap-3'>
            <Link href='/signup/student' className='flex-1'>
              <Button variant='outline' className='w-full gap-2'>
                <User className='h-4 w-4' />
                학생 가입
              </Button>
            </Link>
            <Link href='/signup/parent' className='flex-1'>
              <Button variant='outline' className='w-full gap-2'>
                <Users className='h-4 w-4' />
                학부모 가입
              </Button>
            </Link>
          </div>
          <p className='text-muted-foreground pt-2 text-center text-sm font-bold'>
            해당 사이트는 회원 전용으로, 재원생에 한해 회원가입이 가능합니다.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
