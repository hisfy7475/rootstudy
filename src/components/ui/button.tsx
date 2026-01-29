import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        className={cn(
          // 기본 스타일
          'inline-flex items-center justify-center font-medium transition-all duration-200',
          'rounded-2xl focus:outline-none focus:ring-2 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // variant 스타일
          {
            // Default & Primary - 부드러운 파랑
            'bg-primary text-white hover:bg-primary/90 focus:ring-primary shadow-sm hover:shadow-md':
              variant === 'default' || variant === 'primary',
            // Secondary - 부드러운 핑크
            'bg-secondary text-white hover:bg-secondary/90 focus:ring-secondary shadow-sm hover:shadow-md':
              variant === 'secondary',
            // Outline
            'border-2 border-primary text-primary bg-transparent hover:bg-primary/10 focus:ring-primary':
              variant === 'outline',
            // Ghost
            'text-text hover:bg-gray-100 focus:ring-gray-300':
              variant === 'ghost',
            // Danger
            'bg-error text-white hover:bg-error/90 focus:ring-error shadow-sm hover:shadow-md':
              variant === 'danger',
          },
          // size 스타일
          {
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-5 py-2.5 text-base': size === 'md',
            'px-7 py-3.5 text-lg': size === 'lg',
          },
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
