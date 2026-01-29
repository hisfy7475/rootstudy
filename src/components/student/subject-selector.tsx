'use client';

import { cn } from '@/lib/utils';
import { 
  BookOpen, 
  Calculator, 
  Globe2, 
  FlaskConical, 
  Landmark, 
  MoreHorizontal,
  Check
} from 'lucide-react';

const subjects = [
  { id: 'korean', name: '국어', icon: BookOpen, color: 'bg-red-100 text-red-600' },
  { id: 'math', name: '수학', icon: Calculator, color: 'bg-blue-100 text-blue-600' },
  { id: 'english', name: '영어', icon: Globe2, color: 'bg-green-100 text-green-600' },
  { id: 'science', name: '과학', icon: FlaskConical, color: 'bg-purple-100 text-purple-600' },
  { id: 'social', name: '사회', icon: Landmark, color: 'bg-amber-100 text-amber-600' },
  { id: 'other', name: '기타', icon: MoreHorizontal, color: 'bg-gray-100 text-gray-600' },
];

interface SubjectSelectorProps {
  selected: string | null;
  onSelect: (subjectName: string) => void;
  disabled?: boolean;
  className?: string;
  availableSubjects?: string[] | null; // 학생 타입별 선택 가능 과목 (null이면 모든 과목 표시)
}

export function SubjectSelector({ selected, onSelect, disabled, className, availableSubjects }: SubjectSelectorProps) {
  // availableSubjects가 있으면 해당 과목만 필터링
  const filteredSubjects = availableSubjects 
    ? subjects.filter(s => availableSubjects.includes(s.name))
    : subjects;

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      {filteredSubjects.map((subject) => {
        const Icon = subject.icon;
        const isSelected = selected === subject.name;

        return (
          <button
            key={subject.id}
            onClick={() => onSelect(subject.name)}
            disabled={disabled}
            className={cn(
              'relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all',
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
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', subject.color)}>
              <Icon className="w-6 h-6" />
            </div>
            <span className={cn(
              'text-sm font-medium',
              isSelected ? 'text-primary' : 'text-text'
            )}>
              {subject.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { subjects };
