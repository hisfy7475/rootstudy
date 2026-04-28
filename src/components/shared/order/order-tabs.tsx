'use client';

import { cn } from '@/lib/utils';

export type OrderTab = 'apply' | 'orders';

const TABS: Array<{ value: OrderTab; label: string }> = [
  { value: 'apply', label: '신청하기' },
  { value: 'orders', label: '내역 보기' },
];

export function OrderTabs({
  value,
  onChange,
}: {
  value: OrderTab;
  onChange: (next: OrderTab) => void;
}) {
  return (
    <div className='border-border relative flex border-b'>
      {TABS.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type='button'
            onClick={() => onChange(t.value)}
            className={cn(
              'flex-1 py-3 text-center text-sm font-medium transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            <span className='relative inline-block'>
              {t.label}
              {active && (
                <span className='bg-primary absolute right-0 -bottom-3 left-0 h-0.5 rounded-full' />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
