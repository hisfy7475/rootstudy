'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SubjectSelector } from '@/components/student/subject-selector';
import { Card } from '@/components/ui/card';
import { BookOpen, Clock, History } from 'lucide-react';
import { changeSubject, resetCurrentSubject, restoreSubject } from '@/lib/actions/student';
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
  availableSubjects: string[] | null; // null이면 모든 과목 표시
  isCheckedIn: boolean;
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
  availableSubjects,
  isCheckedIn,
}: SubjectPageClientProps) {
  const [selected, setSelected] = useState<string | null>(currentSubject);
  const [isPending, startTransition] = useTransition();

  // 진행 중인 과목 경과 시간을 계산하기 위한 기준 시각.
  // useState 초기화 함수 안의 Date.now()는 react-hooks/purity 룰의 허용 케이스.
  // 30초마다 갱신해 "x분" 단위 표시가 자연스럽게 누적되게 한다.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // 과목별 누적 학습시간(초) — 진행 중 과목은 nowMs 기준으로 살아 있는 값
  const subjectTimes = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const record of subjectHistory) {
      const startTime = new Date(record.startedAt).getTime();
      const endTime = record.endedAt
        ? new Date(record.endedAt).getTime()
        : record.isCurrent
          ? nowMs
          : startTime;
      const duration = Math.floor((endTime - startTime) / 1000);
      acc[record.name] = (acc[record.name] || 0) + duration;
    }
    return acc;
  }, [subjectHistory, nowMs]);

  const handleSelect = (subjectName: string) => {
    if (subjectName === selected) return;

    setSelected(subjectName);
    startTransition(async () => {
      await changeSubject(subjectName);
    });
  };

  const handleReset = () => {
    const prev = selected;
    if (!prev) return;
    setSelected(null);

    startTransition(async () => {
      const res = await resetCurrentSubject();
      if (res.error || !res.success) {
        setSelected(prev);
        toast.error(res.error ?? '과목 해제에 실패했습니다');
        return;
      }

      const { subjectName, startedAt } = res.success;
      toast.success(`${subjectName} 선택이 해제되었습니다`, {
        duration: 5000,
        action: {
          label: '실행 취소',
          onClick: () => {
            startTransition(async () => {
              const restore = await restoreSubject(subjectName, startedAt);
              if (restore.error) {
                toast.error(restore.error);
              } else {
                setSelected(subjectName);
                toast.success(`${subjectName} 선택이 복원되었습니다`);
              }
            });
          },
        },
      });
    });
  };

  // 과목별 학습시간 정렬
  const sortedSubjectTimes = Object.entries(subjectTimes).sort(([, a], [, b]) => b - a);

  return (
    <div className='space-y-6 p-4'>
      {/* 헤더 */}
      <div className='flex items-center gap-3'>
        <div className='bg-primary/10 flex h-12 w-12 items-center justify-center rounded-2xl'>
          <BookOpen className='text-primary h-6 w-6' />
        </div>
        <div>
          <h1 className='text-text text-xl font-bold'>과목 설정</h1>
          <p className='text-text-muted text-sm'>현재 학습 중인 과목을 선택하세요</p>
        </div>
      </div>

      {/* 현재 과목 */}
      {selected && (
        <Card className='bg-primary/5 border-primary/20 border-2 p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-primary/20 flex h-10 w-10 items-center justify-center rounded-xl'>
              <BookOpen className='text-primary h-5 w-5' />
            </div>
            <div>
              <p className='text-primary text-xs font-medium'>현재 학습 중</p>
              <p className='text-text text-lg font-bold'>{selected}</p>
            </div>
          </div>
        </Card>
      )}

      {/* 과목 선택 */}
      <div>
        <h2 className='text-text-muted mb-3 text-sm font-semibold'>과목 선택</h2>
        {!isCheckedIn && (
          <div className='mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3'>
            <p className='text-sm text-amber-700'>입실 상태에서만 과목을 변경할 수 있습니다.</p>
          </div>
        )}
        <SubjectSelector
          selected={selected}
          onSelect={handleSelect}
          onReset={handleReset}
          disabled={isPending || !isCheckedIn}
          availableSubjects={availableSubjects}
        />
      </div>

      {/* 오늘 과목별 학습시간 */}
      {sortedSubjectTimes.length > 0 && (
        <Card className='p-4'>
          <div className='mb-4 flex items-center gap-2'>
            <Clock className='text-text-muted h-4 w-4' />
            <h3 className='text-text font-semibold'>오늘 과목별 학습시간</h3>
          </div>
          <div className='space-y-3'>
            {sortedSubjectTimes.map(([name, seconds]) => {
              const totalSeconds = Object.values(subjectTimes).reduce((a, b) => a + b, 0);
              const percentage = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;

              return (
                <div key={name}>
                  <div className='mb-1 flex items-center justify-between'>
                    <span className='text-text text-sm font-medium'>{name}</span>
                    <span className='text-text-muted text-sm'>{formatDuration(seconds)}</span>
                  </div>
                  <div className='h-2 overflow-hidden rounded-full bg-gray-100'>
                    <div
                      className='from-primary to-accent h-full rounded-full bg-gradient-to-r transition-all duration-500'
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
        <Card className='p-4'>
          <div className='mb-4 flex items-center gap-2'>
            <History className='text-text-muted h-4 w-4' />
            <h3 className='text-text font-semibold'>오늘 학습 기록</h3>
          </div>
          <div className='space-y-2'>
            {subjectHistory
              .slice()
              .reverse()
              .map((record) => (
                <div
                  key={record.id}
                  className='flex items-center justify-between border-b border-gray-100 py-2 last:border-0'
                >
                  <div className='flex items-center gap-2'>
                    <div
                      className={`h-2 w-2 rounded-full ${record.isCurrent ? 'bg-green-500' : 'bg-gray-300'}`}
                    />
                    <span className='text-text text-sm font-medium'>{record.name}</span>
                  </div>
                  <span className='text-text-muted text-xs'>
                    {format(new Date(record.startedAt), 'HH:mm', { locale: ko })}
                    {record.endedAt &&
                      ` ~ ${format(new Date(record.endedAt), 'HH:mm', { locale: ko })}`}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
