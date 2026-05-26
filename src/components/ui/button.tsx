import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
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
          'rounded-2xl focus:ring-2 focus:ring-offset-2 focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // variant 스타일
          {
            // Default & Primary - 부드러운 파랑
            'bg-primary hover:bg-primary/90 focus:ring-primary text-white shadow-sm hover:shadow-md':
              variant === 'default' || variant === 'primary',
            // Secondary - 부드러운 핑크
            'bg-secondary hover:bg-secondary/90 focus:ring-secondary text-white shadow-sm hover:shadow-md':
              variant === 'secondary',
            // Outline
            'border-primary text-primary hover:bg-primary/10 focus:ring-primary border-2 bg-transparent':
              variant === 'outline',
            // Ghost
            'text-text hover:bg-gray-100 focus:ring-gray-300': variant === 'ghost',
            // Danger - 강조 빨강 (--color-destructive)
            'bg-destructive hover:bg-destructive/90 focus:ring-destructive text-white shadow-sm hover:shadow-md':
              variant === 'danger',
          },
          // size 스타일
          {
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-5 py-2.5 text-base': size === 'md',
            'px-7 py-3.5 text-lg': size === 'lg',
          },
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
