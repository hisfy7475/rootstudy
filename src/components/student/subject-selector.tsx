'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface SubjectSelectorProps {
  selected: string | null;
  onSelect: (subjectName: string) => void;
  disabled?: boolean;
  className?: string;
  availableSubjects?: string[] | null; // 학생 타입별 선택 가능 과목
}

export function SubjectSelector({ selected, onSelect, disabled, className, availableSubjects }: SubjectSelectorProps) {
  // availableSubjects 배열을 그대로 사용 (순서 유지)
  const subjects = availableSubjects || [];

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {subjects.map((subjectName) => {
        const isSelected = selected === subjectName;

        return (
          <button
            key={subjectName}
            onClick={() => onSelect(subjectName)}
            disabled={disabled}
            className={cn(
              'relative flex items-center justify-center p-4 rounded-2xl transition-all',
              'border-2',
              isSelected
                ? 'border-primary bg-primary/5 shadow-md'
                : 'border-transparent bg-card shadow-sm hover:shadow-md hover:border-gray-200',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isSelected && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
            <span className={cn(
              'text-sm font-medium',
              isSelected ? 'text-primary' : 'text-text'
            )}>
              {subjectName}
            </span>
          </button>
        );
      })}
    </div>
  );
}
