'use client';

import type { FormHTMLAttributes, ReactNode } from 'react';
import { signOutWithNativeSync } from '@/lib/sign-out-app';

type SignOutFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'onSubmit'> & {
  children: ReactNode;
};

/** 네이티브 WebView에서 로그아웃 시 SecureStore 정리용 브리지 포함 */
export function SignOutForm({ children, ...props }: SignOutFormProps) {
  return (
    <form
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
        void signOutWithNativeSync();
      }}
    >
      {children}
    </form>
  );
}
