'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, User, Phone, Key, ArrowLeft, Check, CheckCircle, Plus, X } from 'lucide-react';
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
    if (verifiedStudents.some((s) => s.code === currentCode)) {
      setError('이미 추가된 연결 코드입니다.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    const result = await verifyParentCode(currentCode);

    if (result.success && result.data?.studentName && result.data?.studentId) {
      setVerifiedStudents((prev) => [
        ...prev,
        {
          code: currentCode,
          name: result.data!.studentName!,
          id: result.data!.studentId!,
        },
      ]);
      setCurrentCode('');
    } else {
      setError(result.error || '유효하지 않은 연결 코드입니다.');
    }
    setIsVerifying(false);
  }

  function handleRemoveStudent(code: string) {
    setVerifiedStudents((prev) => prev.filter((s) => s.code !== code));
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
    formData.append('parentCodes', JSON.stringify(verifiedStudents.map((s) => s.code)));

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
      <div className='bg-background flex min-h-screen items-center justify-center p-4'>
        <Card className='w-full max-w-md'>
          <CardHeader className='text-center'>
            <div className='bg-success/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
              <Check className='text-success h-8 w-8' />
            </div>
            <CardTitle className='text-2xl'>회원가입 완료!</CardTitle>
            <CardDescription>
              {verifiedStudents.length === 1
                ? `${verifiedStudents[0].name} 학생과 연결되었습니다`
                : `${verifiedStudents.length}명의 자녀와 연결되었습니다`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-text-muted text-center text-sm'>
              이제 자녀의 학습 현황을 확인하고
              <br />
              관리자와 소통할 수 있습니다.
            </p>
            {verifiedStudents.length > 1 && (
              <div className='mt-4 rounded-xl bg-gray-50 p-3 text-sm'>
                <div className='mb-2 font-medium'>연결된 자녀:</div>
                <ul className='space-y-1'>
                  {verifiedStudents.map((s) => (
                    <li key={s.code} className='text-text-muted'>
                      • {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Link href='/login' className='w-full'>
              <Button className='w-full'>로그인 하러 가기</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const hasVerifiedStudents = verifiedStudents.length > 0;

  // 회원가입 폼
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
          <div className='mx-auto mb-4'>
            <Image
              src='/logo.png'
              alt='WHEVER STUDY route 관리형 독서실'
              width={180}
              height={72}
              className='object-contain'
              priority
            />
          </div>
          <CardTitle className='text-2xl'>학부모 회원가입</CardTitle>
          <CardDescription>자녀의 학습을 함께 관리해보세요</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 연결 코드 입력 영역 */}
          <div className='mb-6'>
            <div className='text-text mb-2 text-sm font-medium'>1. 학생 연결 코드 입력</div>

            {/* 이미 추가된 자녀 목록 */}
            {verifiedStudents.length > 0 && (
              <div className='mb-3 space-y-2'>
                {verifiedStudents.map((student) => (
                  <div
                    key={student.code}
                    className='bg-success/10 text-success flex items-center justify-between rounded-xl p-3 text-sm'
                  >
                    <div className='flex items-center gap-2'>
                      <CheckCircle className='h-4 w-4' />
                      <span>
                        <strong>{student.name}</strong> ({student.code})
                      </span>
                    </div>
                    <button
                      type='button'
                      onClick={() => handleRemoveStudent(student.code)}
                      className='hover:bg-success/20 rounded-lg p-1 transition-colors'
                    >
                      <X className='h-4 w-4' />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 새 연결 코드 입력 */}
            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <Key className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='text'
                  value={currentCode}
                  onChange={(e) => setCurrentCode(e.target.value.toUpperCase())}
                  placeholder={hasVerifiedStudents ? '추가 연결 코드' : '연결 코드 입력'}
                  className='pl-12 uppercase'
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
                type='button'
                variant='outline'
                onClick={handleVerifyCode}
                disabled={isVerifying || !currentCode}
              >
                {isVerifying ? '확인 중...' : <Plus className='h-5 w-5' />}
              </Button>
            </div>
            <p className='text-text-muted mt-2 text-xs'>
              여러 자녀가 있다면 연결 코드를 추가로 입력할 수 있습니다.
            </p>
          </div>

          {/* 회원 정보 입력 폼 */}
          <div
            className={`transition-opacity ${hasVerifiedStudents ? 'opacity-100' : 'pointer-events-none opacity-50'}`}
          >
            <div className='text-text mb-2 text-sm font-medium'>2. 회원 정보 입력</div>
            <form action={handleSubmit} className='space-y-4'>
              <div className='relative'>
                <Mail className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='email'
                  name='email'
                  placeholder='이메일'
                  className='pl-12'
                  required
                  disabled={isLoading || !hasVerifiedStudents}
                />
              </div>
              <div className='relative'>
                <Lock className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='password'
                  name='password'
                  placeholder='비밀번호 (6자 이상)'
                  className='pl-12'
                  required
                  disabled={isLoading || !hasVerifiedStudents}
                />
              </div>
              <div className='relative'>
                <Lock className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='password'
                  name='confirmPassword'
                  placeholder='비밀번호 확인'
                  className='pl-12'
                  required
                  disabled={isLoading || !hasVerifiedStudents}
                />
              </div>
              <div className='relative'>
                <User className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='text'
                  name='name'
                  placeholder='이름'
                  className='pl-12'
                  required
                  disabled={isLoading || !hasVerifiedStudents}
                />
              </div>
              <div>
                <div className='relative'>
                  <Phone className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                  <Input
                    type='tel'
                    name='phone'
                    placeholder='전화번호 (선택)'
                    className='pl-12'
                    disabled={isLoading || !hasVerifiedStudents}
                  />
                </div>
                <p className='text-text-muted mt-1 text-xs'>
                  자녀의 출결·상벌점·결제 알림 수신 및 비상 연락을 위한 번호입니다.
                </p>
              </div>

              {error && (
                <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>
                  {error}
                </div>
              )}

              <Button
                type='submit'
                className='w-full'
                size='lg'
                disabled={isLoading || !hasVerifiedStudents}
              >
                {isLoading ? '가입 중...' : '회원가입'}
              </Button>
            </form>
          </div>
        </CardContent>
        <CardFooter className='justify-center'>
          <span className='text-text-muted text-sm'>
            이미 계정이 있으신가요?{' '}
            <Link href='/login' className='text-primary hover:underline'>
              로그인
            </Link>
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
