'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Lock, User, Phone, Key, ArrowLeft, Check, UserPlus, CheckCircle, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { signUpParent, verifyParentCode } from '../../actions';

interface VerifiedStudent {
  code: string;
  name: string;
  id: string;
}

export default function ParentSignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  // 여러 자녀 연결 코드 관리
  const [currentCode, setCurrentCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedStudents, setVerifiedStudents] = useState<VerifiedStudent[]>([]);

  async function handleVerifyCode() {
    if (!currentCode) {
      setError('연결 코드를 입력해주세요.');
      return;
    }

    // 이미 추가된 코드인지 확인
    if (verifiedStudents.some(s => s.code === currentCode)) {
      setError('이미 추가된 연결 코드입니다.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    const result = await verifyParentCode(currentCode);

    if (result.success && result.data?.studentName && result.data?.studentId) {
      setVerifiedStudents(prev => [...prev, {
        code: currentCode,
        name: result.data!.studentName!,
        id: result.data!.studentId!,
      }]);
      setCurrentCode('');
    } else {
      setError(result.error || '유효하지 않은 연결 코드입니다.');
    }
    setIsVerifying(false);
  }

  function handleRemoveStudent(code: string) {
    setVerifiedStudents(prev => prev.filter(s => s.code !== code));
  }

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

    if (verifiedStudents.length === 0) {
      setError('최소 한 명의 자녀를 연결해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    // 연결 코드 배열을 FormData에 추가
    formData.append('parentCodes', JSON.stringify(verifiedStudents.map(s => s.code)));

    const result = await signUpParent(formData);

    if (result.success) {
      setIsComplete(true);
    } else {
      setError(result.error || '회원가입에 실패했습니다.');
    }
    setIsLoading(false);
  }

  // 회원가입 완료
  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-success/20 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-success" />
            </div>
            <CardTitle className="text-2xl">회원가입 완료!</CardTitle>
            <CardDescription>
              {verifiedStudents.length === 1 
                ? `${verifiedStudents[0].name} 학생과 연결되었습니다`
                : `${verifiedStudents.length}명의 자녀와 연결되었습니다`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted text-center">
              이제 자녀의 학습 현황을 확인하고<br />
              관리자와 소통할 수 있습니다.
            </p>
            {verifiedStudents.length > 1 && (
              <div className="mt-4 p-3 rounded-xl bg-gray-50 text-sm">
                <div className="font-medium mb-2">연결된 자녀:</div>
                <ul className="space-y-1">
                  {verifiedStudents.map(s => (
                    <li key={s.code} className="text-text-muted">• {s.name}</li>
                  ))}
                </ul>
              </div>
            )}
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

  const hasVerifiedStudents = verifiedStudents.length > 0;

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
          <div className="mx-auto mb-4 w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center">
            <UserPlus className="w-8 h-8 text-secondary" />
          </div>
          <CardTitle className="text-2xl">학부모 회원가입</CardTitle>
          <CardDescription>
            자녀의 학습을 함께 관리해보세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 연결 코드 입력 영역 */}
          <div className="mb-6">
            <div className="text-sm font-medium text-text mb-2">
              1. 학생 연결 코드 입력
            </div>
            
            {/* 이미 추가된 자녀 목록 */}
            {verifiedStudents.length > 0 && (
              <div className="mb-3 space-y-2">
                {verifiedStudents.map(student => (
                  <div 
                    key={student.code}
                    className="flex items-center justify-between p-3 rounded-xl bg-success/10 text-success text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      <span><strong>{student.name}</strong> ({student.code})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStudent(student.code)}
                      className="p-1 hover:bg-success/20 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 새 연결 코드 입력 */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Key className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
                <Input
                  type="text"
                  value={currentCode}
                  onChange={(e) => setCurrentCode(e.target.value.toUpperCase())}
                  placeholder={hasVerifiedStudents ? "추가 연결 코드" : "연결 코드 입력"}
                  className="pl-12 uppercase"
                  disabled={isVerifying}
                  maxLength={6}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleVerifyCode();
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleVerifyCode}
                disabled={isVerifying || !currentCode}
              >
                {isVerifying ? (
                  '확인 중...'
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              여러 자녀가 있다면 연결 코드를 추가로 입력할 수 있습니다.
            </p>
          </div>

          {/* 회원 정보 입력 폼 */}
          <div className={`transition-opacity ${hasVerifiedStudents ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <div className="text-sm font-medium text-text mb-2">
              2. 회원 정보 입력
            </div>
            <form action={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
                <Input
                  type="email"
                  name="email"
                  placeholder="이메일"
                  className="pl-12"
                  required
                  disabled={isLoading || !hasVerifiedStudents}
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
                  disabled={isLoading || !hasVerifiedStudents}
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
                  disabled={isLoading || !hasVerifiedStudents}
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
                  disabled={isLoading || !hasVerifiedStudents}
                />
              </div>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-muted" />
                <Input
                  type="tel"
                  name="phone"
                  placeholder="전화번호 (선택)"
                  className="pl-12"
                  disabled={isLoading || !hasVerifiedStudents}
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
                disabled={isLoading || !hasVerifiedStudents}
              >
                {isLoading ? '가입 중...' : '회원가입'}
              </Button>
            </form>
          </div>
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
