'use client';

import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

const TINT_CLASSES = [
  { border: 'border-l-blue-400', bg: 'bg-blue-50/60' },
  { border: 'border-l-rose-400', bg: 'bg-rose-50/60' },
  { border: 'border-l-emerald-400', bg: 'bg-emerald-50/60' },
  { border: 'border-l-amber-400', bg: 'bg-amber-50/60' },
  { border: 'border-l-violet-400', bg: 'bg-violet-50/60' },
  { border: 'border-l-cyan-400', bg: 'bg-cyan-50/60' },
  { border: 'border-l-orange-400', bg: 'bg-orange-50/60' },
] as const;

interface SubjectSelectorProps {
  selected: string | null;
  onSelect: (subjectName: string) => void;
  onReset?: () => void;
  disabled?: boolean;
  className?: string;
  availableSubjects?: string[] | null;
  variant?: 'default' | 'prominent';
}

export function SubjectSelector({
  selected,
  onSelect,
  onReset,
  disabled,
  className,
  availableSubjects,
  variant = 'default',
}: SubjectSelectorProps) {
  const subjects = availableSubjects || [];
  const isProminent = variant === 'prominent';

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {subjects.map((subjectName, index) => {
        const isSelected = selected === subjectName;
        const tint = TINT_CLASSES[index % TINT_CLASSES.length];

        return (
          <div key={subjectName} className='relative'>
            <button
              type='button'
              onClick={() => onSelect(subjectName)}
              disabled={disabled}
              className={cn(
                'flex w-full touch-manipulation items-center justify-center rounded-2xl border-2 transition-all',
                isProminent && 'min-h-[52px] border-l-4 px-3 py-3.5',
                !isProminent && 'p-4',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-md'
                  : isProminent
                    ? cn(
                        'border-gray-200 hover:border-gray-300 hover:shadow-md',
                        tint.border,
                        tint.bg,
                      )
                    : 'bg-card border-transparent shadow-sm hover:border-gray-200 hover:shadow-md',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  isProminent ? 'text-base font-semibold' : 'text-sm font-medium',
                  isSelected ? 'text-primary font-bold' : 'text-text',
                )}
              >
                {subjectName}
              </span>
            </button>

            {isSelected && onReset && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
                disabled={disabled}
                aria-label={`${subjectName} 선택 해제`}
                className={cn(
                  'bg-primary absolute z-10 flex touch-manipulation items-center justify-center rounded-full shadow-sm',
                  'hover:bg-primary/90 transition-transform active:scale-95',
                  // 시각 배지 + 보이지 않는 hit area 확장 (before: 가상 요소)
                  'before:absolute before:-inset-2 before:content-[""]',
                  isProminent ? '-top-1.5 -right-1.5 h-6 w-6' : '-top-1 -right-1 h-5 w-5',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <X
                  className={isProminent ? 'h-3.5 w-3.5 text-white' : 'h-3 w-3 text-white'}
                  strokeWidth={3}
                />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
