'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Mail,
  Lock,
  User,
  Phone,
  ArrowLeft,
  Copy,
  Check,
  Building2,
  GraduationCap,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { signUpStudent } from '../../actions';
import { getAllBranches, type Branch } from '@/lib/actions/branch';
import { getStudentTypes } from '@/lib/actions/student-type';
import type { StudentType } from '@/types/database';

export default function StudentSignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parentCode, setParentCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [studentTypes, setStudentTypes] = useState<StudentType[]>([]);

  useEffect(() => {
    // 지점 목록 로드 (display_order 순으로 정렬됨)
    // 지점은 학생이 직접 선택하도록 기본값을 두지 않음 ("지점 선택" placeholder 표시)
    getAllBranches().then(setBranches);

    // 학생 타입 목록 로드 (지점 무관, 전체 조회)
    getStudentTypes().then(setStudentTypes);
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
      <div className='bg-background flex min-h-screen items-center justify-center p-4'>
        <Card className='w-full max-w-md'>
          <CardHeader className='text-center'>
            <div className='bg-success/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full'>
              <Check className='text-success h-8 w-8' />
            </div>
            <CardTitle className='text-2xl'>회원가입 완료!</CardTitle>
            <CardDescription>아래 연결 코드를 학부모님께 전달해주세요</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='rounded-2xl bg-gray-50 p-6 text-center'>
              <div className='text-text-muted mb-2 text-sm'>학부모 연결 코드</div>
              <div className='text-primary mb-4 text-3xl font-bold tracking-widest'>
                {parentCode}
              </div>
              <Button variant='outline' onClick={copyToClipboard} className='gap-2'>
                {copied ? (
                  <>
                    <Check className='h-4 w-4' />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className='h-4 w-4' />
                    코드 복사
                  </>
                )}
              </Button>
            </div>
            <p className='text-text-muted mt-4 text-center text-sm'>
              학부모님이 회원가입 시 이 코드를 입력하면
              <br />
              학생과 학부모 계정이 연결됩니다.
            </p>
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
          <CardTitle className='text-2xl'>학생 회원가입</CardTitle>
          <CardDescription>학습 관리를 시작해보세요</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className='space-y-4'>
            {/* 계정 정보 */}
            <div className='space-y-4'>
              <div className='relative'>
                <Mail className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='email'
                  name='email'
                  placeholder='이메일'
                  className='pl-12'
                  required
                  disabled={isLoading}
                />
              </div>
              <PasswordInput
                name='password'
                placeholder='비밀번호 (6자 이상)'
                className='pl-12'
                required
                disabled={isLoading}
                leftIcon={
                  <Lock className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                }
              />
              <PasswordInput
                name='confirmPassword'
                placeholder='비밀번호 확인'
                className='pl-12'
                required
                disabled={isLoading}
                leftIcon={
                  <Lock className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                }
              />
            </div>

            {/* 구분선 */}
            <div className='relative py-1'>
              <div className='absolute inset-0 flex items-center'>
                <div className='w-full border-t border-gray-200' />
              </div>
              <div className='relative flex justify-center'>
                <span className='text-text-muted bg-white px-3 text-xs'>개인 정보</span>
              </div>
            </div>

            {/* 개인 정보 */}
            <div className='space-y-4'>
              <div className='relative'>
                <User className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='text'
                  name='name'
                  placeholder='이름'
                  className='pl-12'
                  required
                  disabled={isLoading}
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
                    disabled={isLoading}
                  />
                </div>
                <p className='text-text-muted mt-1 text-xs'>
                  학원 알림(출결·상벌점·공지) 수신 및 비상 연락용입니다.
                </p>
              </div>
              <div className='relative'>
                <BookOpen className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <Input
                  type='text'
                  name='school'
                  placeholder='학교 이름'
                  className='pl-12'
                  required
                  disabled={isLoading}
                />
              </div>
              <div className='relative'>
                <Building2 className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <select
                  name='branchId'
                  required
                  disabled={isLoading}
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className='focus:ring-primary w-full appearance-none rounded-xl border border-gray-200 bg-white py-3 pr-4 pl-12 text-gray-800 focus:ring-2 focus:outline-none'
                >
                  <option value=''>지점 선택</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 학생 타입(학년) 선택 - 필수 */}
              <div className='relative'>
                <GraduationCap className='text-text-muted absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 transform' />
                <select
                  name='studentTypeId'
                  required
                  disabled={isLoading || studentTypes.length === 0}
                  className='focus:ring-primary w-full appearance-none rounded-xl border border-gray-200 bg-white py-3 pr-4 pl-12 text-gray-800 focus:ring-2 focus:outline-none'
                >
                  <option value=''>학년 선택</option>
                  {studentTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                {studentTypes.length === 0 && (
                  <p className='text-text-muted mt-1 ml-1 text-xs'>
                    등록된 학년이 없습니다. 관리자에게 문의하세요.
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className='bg-error/10 text-error rounded-xl p-3 text-center text-sm'>
                {error}
              </div>
            )}

            <Button type='submit' className='w-full' size='lg' disabled={isLoading}>
              {isLoading ? '가입 중...' : '회원가입'}
            </Button>
          </form>
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
