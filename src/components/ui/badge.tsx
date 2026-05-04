import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: 'bg-primary/15 text-primary',
  success: 'bg-success/30 text-green-700',
  warning: 'bg-warning/40 text-yellow-700',
  danger: 'bg-error/25 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  muted: 'bg-gray-100 text-text-muted',
};

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  );
}
