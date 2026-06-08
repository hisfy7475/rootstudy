'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input, type InputProps } from '@/components/ui/input';

export interface PasswordInputProps extends Omit<InputProps, 'type'> {
  /** 입력 좌측에 표시할 아이콘 (예: <Lock className="... absolute left-4 ..." />). 위치 클래스는 호출부에서 지정. */
  leftIcon?: React.ReactNode;
  /** relative 래퍼에 추가할 클래스 (예: 바깥 여백 mt-1). */
  wrapperClassName?: string;
}

/**
 * 비밀번호 입력 + 보기/숨기기 토글(눈 아이콘)을 내장한 공용 컴포넌트.
 * 기존 Input 을 그대로 감싸므로 placeholder/value/onChange/disabled 등 모든 Input props 를 전달할 수 있다.
 * 우측 토글 버튼 자리를 위해 입력에 기본 pr-10 패딩이 적용된다.
 */
export function PasswordInput({
  leftIcon,
  wrapperClassName,
  className,
  ...props
}: PasswordInputProps) {
  const [show, setShow] = React.useState(false);

  return (
    <div className={cn('relative w-full', wrapperClassName)}>
      {leftIcon}
      <Input type={show ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <button
        type='button'
        onClick={() => setShow((v) => !v)}
        className='text-text-muted absolute top-1/2 right-3 -translate-y-1/2 hover:text-gray-700'
        aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
        tabIndex={-1}
      >
        {show ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
      </button>
    </div>
  );
}
