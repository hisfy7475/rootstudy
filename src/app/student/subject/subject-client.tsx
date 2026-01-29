'use client';

import { useState, useTransition } from 'react';
import { SubjectSelector } from '@/components/student/subject-selector';
import { Card } from '@/components/ui/card';
import { BookOpen, Clock, History } from 'lucide-react';
import { changeSubject } from '@/lib/actions/student';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface SubjectHistory {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  isCurrent: boolean;
}

interface SubjectPageClientProps {
  currentSubject: string | null;
  subjectHistory: SubjectHistory[];
  subjectTimes: Record<string, number>;
  availableSubjects: string[] | null; // null이면 모든 과목 표시
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

export function SubjectPageClient({ 
  currentSubject, 
  subjectHistory, 
  subjectTimes,
  availableSubjects
}: SubjectPageClientProps) {
  const [selected, setSelected] = useState<string | null>(currentSubject);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (subjectName: string) => {
    if (subjectName === currentSubject) return;
    
    setSelected(subjectName);
    startTransition(async () => {
      await changeSubject(subjectName);
    });
  };

  // 과목별 학습시간 정렬
  const sortedSubjectTimes = Object.entries(subjectTimes)
    .sort(([, a], [, b]) => b - a);

  return (
    <div className="p-4 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text">과목 설정</h1>
          <p className="text-sm text-text-muted">현재 학습 중인 과목을 선택하세요</p>
        </div>
      </div>

      {/* 현재 과목 */}
      {currentSubject && (
        <Card className="p-4 bg-primary/5 border-2 border-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-primary font-medium">현재 학습 중</p>
              <p className="font-bold text-text text-lg">{currentSubject}</p>
            </div>
          </div>
        </Card>
      )}

      {/* 과목 선택 */}
      <div>
        <h2 className="text-sm font-semibold text-text-muted mb-3">과목 선택</h2>
        <SubjectSelector
          selected={selected}
          onSelect={handleSelect}
          disabled={isPending}
          availableSubjects={availableSubjects}
        />
      </div>

      {/* 오늘 과목별 학습시간 */}
      {sortedSubjectTimes.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-text-muted" />
            <h3 className="font-semibold text-text">오늘 과목별 학습시간</h3>
          </div>
          <div className="space-y-3">
            {sortedSubjectTimes.map(([name, seconds]) => {
              const totalSeconds = Object.values(subjectTimes).reduce((a, b) => a + b, 0);
              const percentage = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;

              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text">{name}</span>
                    <span className="text-sm text-text-muted">{formatDuration(seconds)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 과목 변경 기록 */}
      {subjectHistory.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-text-muted" />
            <h3 className="font-semibold text-text">오늘 학습 기록</h3>
          </div>
          <div className="space-y-2">
            {subjectHistory.slice().reverse().map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${record.isCurrent ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-medium text-text">{record.name}</span>
                </div>
                <span className="text-xs text-text-muted">
                  {format(new Date(record.startedAt), 'HH:mm', { locale: ko })}
                  {record.endedAt && ` ~ ${format(new Date(record.endedAt), 'HH:mm', { locale: ko })}`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
