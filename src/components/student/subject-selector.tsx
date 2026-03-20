'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

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
  disabled?: boolean;
  className?: string;
  availableSubjects?: string[] | null;
  variant?: 'default' | 'prominent';
}

export function SubjectSelector({ selected, onSelect, disabled, className, availableSubjects, variant = 'default' }: SubjectSelectorProps) {
  const subjects = availableSubjects || [];
  const isProminent = variant === 'prominent';

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {subjects.map((subjectName, index) => {
        const isSelected = selected === subjectName;
        const tint = TINT_CLASSES[index % TINT_CLASSES.length];

        return (
          <button
            key={subjectName}
            onClick={() => onSelect(subjectName)}
            disabled={disabled}
            className={cn(
              'relative flex items-center justify-center rounded-2xl transition-all border-2',
              isProminent && 'py-3.5 px-3 min-h-[52px] border-l-4',
              !isProminent && 'p-4',
              isSelected
                ? 'border-primary bg-primary/5 shadow-md'
                : isProminent
                  ? cn('border-gray-200 hover:shadow-md hover:border-gray-300', tint.border, tint.bg)
                  : 'border-transparent bg-card shadow-sm hover:shadow-md hover:border-gray-200',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isSelected && (
              <div className={cn(
                'absolute bg-primary rounded-full flex items-center justify-center',
                isProminent ? '-top-1.5 -right-1.5 w-6 h-6' : '-top-1 -right-1 w-5 h-5'
              )}>
                <Check className={isProminent ? 'w-3.5 h-3.5 text-white' : 'w-3 h-3 text-white'} />
              </div>
            )}
            <span className={cn(
              isProminent ? 'text-base font-semibold' : 'text-sm font-medium',
              isSelected ? 'text-primary font-bold' : 'text-text'
            )}>
              {subjectName}
            </span>
          </button>
        );
      })}
    </div>
  );
}
