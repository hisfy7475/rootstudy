import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  /** 첫 머리에 빈 placeholder 옵션을 둘 때의 라벨 */
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, placeholder, className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'text-text rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm',
        'focus:ring-primary focus:border-transparent focus:ring-2 focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {placeholder !== undefined && (
        <option value='' disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export { Select };
