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

    // #region agent log
    fetch('http://127.0.0.1:7247/ingest/888ac2ee-d945-49d4-9c42-79185fbe90b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'login/page.tsx:handleSubmit:start',message:'Login form submitted',data:{email:formData.get('email')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    const result = await signIn(formData);

    // #region agent log
    fetch('http://127.0.0.1:7247/ingest/888ac2ee-d945-49d4-9c42-79185fbe90b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'login/page.tsx:handleSubmit:afterSignIn',message:'signIn result received',data:{success:result.success,error:result.error},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (result.success) {
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/888ac2ee-d945-49d4-9c42-79185fbe90b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'login/page.tsx:handleSubmit:beforePush',message:'About to router.push(/)',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      router.push('/');
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/888ac2ee-d945-49d4-9c42-79185fbe90b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'login/page.tsx:handleSubmit:afterPush',message:'After router.push, before refresh',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      router.refresh();
      // #region agent log
      fetch('http://127.0.0.1:7247/ingest/888ac2ee-d945-49d4-9c42-79185fbe90b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'login/page.tsx:handleSubmit:afterRefresh',message:'After router.refresh',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
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
          <CardTitle className="text-2xl">로그인</CardTitle>
          <CardDescription>
            독서실 학습관리 시스템에 오신 것을 환영합니다
          </CardDescription>
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
