'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mail, Lock, User, Phone, Hash, ArrowLeft, Copy, Check, UserPlus, Calendar, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { signUpStudent } from '../../actions';
import { getAllBranches, type Branch } from '@/lib/actions/branch';

export default function StudentSignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parentCode, setParentCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    // 지점 목록 로드
    getAllBranches().then(setBranches);
  }, []);

  async function handleSubmit(formData: FormData) {
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await signUpStudent(formData);

    if (result.success && result.data?.parentCode) {
      setParentCode(result.data.parentCode);
    } else {
      setError(result.error || '회원가입에 실패했습니다.');
    }
    setIsLoading(false);
  }

  async function copyToClipboard() {
    if (parentCode) {
      await navigator.clipboard.writeText(parentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // 회원가입 완료 - 학부모 연결 코드 표시
  if (parentCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-success/20 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">회원가입 완료!</CardTitle>
            <CardDescription>
              아래 연결 코드를 학부모님께 전달해주세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 rounded-2xl p-6 text-center">
              <div className="text-sm text-text-muted mb-2">학부모 연결 코드</div>
              <div className="text-3xl font-bold tracking-widest text-primary mb-4">
                {parentCode}
              </div>
              <Button
                variant="outline"
                onClick={copyToClipboard}
                className="gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    코드 복사
                  </>
                )}
              </Button>
            </div>
            <p className="mt-4 text-sm text-text-muted text-center">
              학부모님이 회원가입 시 이 코드를 입력하면<br />
              학생과 학부모 계정이 연결됩니다.
            </p>
          </CardContent>
          <CardFooter>
            <Link href="/login" className="w-full">
              <Button className="w-full">로그인 하러 가기</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 회원가입 폼
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
          <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <UserPlus className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">학생 회원가입</CardTitle>
          <CardDescription>
            학습 관리를 시작해보세요
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
                placeholder="비밀번호 (6자 이상)"
                className="pl-12"
                required
                disabled={isLoading}
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                type="password"
                name="confirmPassword"
                placeholder="비밀번호 확인"
                className="pl-12"
                required
                disabled={isLoading}
              />
            </div>
            <div className="relative">
              <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                type="text"
                name="name"
                placeholder="이름"
                className="pl-12"
                required
                disabled={isLoading}
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                type="tel"
                name="phone"
                placeholder="전화번호 (선택)"
                className="pl-12"
                disabled={isLoading}
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                type="date"
                name="birthday"
                placeholder="생년월일"
                className="pl-12"
                required
                disabled={isLoading}
              />
            </div>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <select
                name="branchId"
                required
                disabled={isLoading}
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary text-gray-800 bg-white appearance-none"
              >
                <option value="">지점 선택 *</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
            <div className="relative">
              <Hash className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
              <Input
                type="number"
                name="seatNumber"
                placeholder="좌석번호 (선택)"
                className="pl-12"
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
              {isLoading ? '가입 중...' : '회원가입'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <span className="text-sm text-text-muted">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-primary hover:underline">
              로그인
            </Link>
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
