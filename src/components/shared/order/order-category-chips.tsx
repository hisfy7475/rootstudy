'use client';

import { cn } from '@/lib/utils';

export type OrderCategory = 'all' | 'meal' | 'exam';

const CHIPS: Array<{ value: OrderCategory; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'meal', label: '급식' },
  { value: 'exam', label: '모의고사' },
];

export function OrderCategoryChips({
  value,
  onChange,
}: {
  value: OrderCategory;
  onChange: (next: OrderCategory) => void;
}) {
  return (
    <div className='flex gap-2'>
      {CHIPS.map((c) => {
        const active = c.value === value;
        return (
          <button
            key={c.value}
            type='button'
            onClick={() => onChange(c.value)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border text-foreground',
            )}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
