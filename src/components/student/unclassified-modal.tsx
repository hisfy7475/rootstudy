'use client';

import { useState, useTransition, useMemo } from 'react';
import { X, Clock, Check, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { assignUnclassifiedTime } from '@/lib/actions/student';
import { format, addMinutes } from 'date-fns';
import { ko } from 'date-fns/locale';

interface UnclassifiedSegment {
  id: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

interface UnclassifiedModalProps {
  isOpen: boolean;
  onClose: () => void;
  segment: UnclassifiedSegment | null;
  availableSubjects: string[] | null;
  onAssignComplete: () => void;
}

const defaultSubjects = ['국어', '수학', '영어', '과학', '사회', '기타'];

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

export function UnclassifiedModal({
  isOpen,
  onClose,
  segment,
  availableSubjects,
  onAssignComplete,
}: UnclassifiedModalProps) {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState<number>(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const subjects = availableSubjects || defaultSubjects;

  // 총 분 계산
  const totalMinutes = segment ? Math.floor(segment.durationSeconds / 60) : 0;

  // 선택된 분에 따른 종료 시간 계산
  const calculatedEndTime = useMemo(() => {
    if (!segment || selectedMinutes === 0) return null;
    const start = new Date(segment.startTime);
    return addMinutes(start, selectedMinutes);
  }, [segment, selectedMinutes]);

  // 모달 열릴 때 전체 시간으로 초기화
  useState(() => {
    if (segment) {
      setSelectedMinutes(totalMinutes);
    }
  });

  const handleAssign = () => {
    if (!segment || !selectedSubject || selectedMinutes === 0) return;

    setError(null);
    startTransition(async () => {
      const startTime = segment.startTime;
      const endTime = calculatedEndTime?.toISOString() || segment.endTime;

      const result = await assignUnclassifiedTime(startTime, endTime, selectedSubject);

      if (result.error) {
        setError(result.error);
      } else {
        resetAndClose();
        onAssignComplete();
      }
    });
  };

  const resetAndClose = () => {
    setSelectedSubject(null);
    setSelectedMinutes(0);
    setError(null);
    onClose();
  };

  const handleMinutesChange = (delta: number) => {
    setSelectedMinutes((prev) => {
      const next = prev + delta;
      if (next < 5) return 5; // 최소 5분
      if (next > totalMinutes) return totalMinutes;
      return next;
    });
  };

  // 모달 열릴 때 전체 시간으로 설정
  if (isOpen && segment && selectedMinutes === 0) {
    setSelectedMinutes(totalMinutes);
  }

  if (!isOpen || !segment) return null;

  const startTime = new Date(segment.startTime);
  const endTime = new Date(segment.endTime);

  return (
    <div className='fixed inset-0 z-[55] flex items-end justify-center'>
      {/* 배경 오버레이 */}
      <div className='absolute inset-0 bg-black/50' onClick={resetAndClose} />

      {/* 모달 콘텐츠 */}
      <div className='animate-slide-up relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-3xl bg-white'>
        {/* 핸들 */}
        <div className='flex flex-shrink-0 justify-center bg-white pt-3'>
          <div className='h-1 w-10 rounded-full bg-gray-300' />
        </div>

        {/* 헤더 */}
        <div className='flex flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white p-4'>
          <h2 className='text-text text-lg font-bold'>미분류 시간 분류</h2>
          <button
            onClick={resetAndClose}
            className='rounded-full p-2 transition-colors hover:bg-gray-100'
          >
            <X className='text-text-muted h-5 w-5' />
          </button>
        </div>

        {/* 스크롤 가능한 콘텐츠 영역 */}
        <div className='min-h-0 flex-1 overflow-y-auto'>
          {/* 시간 정보 */}
          <div className='border-b border-gray-100 p-4'>
            <div className='flex items-center gap-3 rounded-xl bg-orange-100 p-3'>
              <Clock className='h-5 w-5 flex-shrink-0 text-orange-500' />
              <div>
                <p className='text-text font-medium'>
                  {format(startTime, 'M월 d일', { locale: ko })} {format(startTime, 'HH:mm')} ~{' '}
                  {format(endTime, 'HH:mm')}
                </p>
                <p className='text-text-muted text-sm'>
                  총 {formatDuration(segment.durationSeconds)}
                </p>
              </div>
            </div>
          </div>

          {/* 시간 선택 */}
          <div className='border-b border-gray-100 p-4'>
            <p className='text-text-muted mb-3 text-sm font-medium'>할당할 시간 선택</p>
            <div className='flex items-center justify-center gap-4'>
              <button
                onClick={() => handleMinutesChange(-5)}
                disabled={isPending || selectedMinutes <= 5}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                  selectedMinutes <= 5
                    ? 'bg-gray-100 text-gray-300'
                    : 'text-text bg-gray-100 hover:bg-gray-200',
                )}
              >
                <Minus className='h-5 w-5' />
              </button>

              <div className='min-w-[120px] text-center'>
                <p className='text-primary text-3xl font-bold'>{selectedMinutes}분</p>
                {calculatedEndTime && (
                  <p className='text-text-muted mt-1 text-xs'>
                    {format(startTime, 'HH:mm')} ~ {format(calculatedEndTime, 'HH:mm')}
                  </p>
                )}
              </div>

              <button
                onClick={() => handleMinutesChange(5)}
                disabled={isPending || selectedMinutes >= totalMinutes}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                  selectedMinutes >= totalMinutes
                    ? 'bg-gray-100 text-gray-300'
                    : 'text-text bg-gray-100 hover:bg-gray-200',
                )}
              >
                <Plus className='h-5 w-5' />
              </button>
            </div>

            {/* 빠른 선택 버튼 */}
            <div className='mt-3 flex justify-center gap-2'>
              {[15, 30, 45, 60]
                .filter((m) => m <= totalMinutes)
                .map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => setSelectedMinutes(minutes)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      selectedMinutes === minutes
                        ? 'bg-primary text-white'
                        : 'text-text-muted bg-gray-100 hover:bg-gray-200',
                    )}
                  >
                    {minutes}분
                  </button>
                ))}
              {totalMinutes > 5 && (
                <button
                  onClick={() => setSelectedMinutes(totalMinutes)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    selectedMinutes === totalMinutes
                      ? 'bg-primary text-white'
                      : 'text-text-muted bg-gray-100 hover:bg-gray-200',
                  )}
                >
                  전체
                </button>
              )}
            </div>
          </div>

          {/* 과목 선택 */}
          <div className='py-4'>
            <p className='text-text-muted mb-3 px-4 text-sm font-medium'>과목 선택</p>
            <div className='scrollbar-hide flex gap-2 overflow-x-auto px-4 pb-2'>
              {subjects.map((subject) => (
                <button
                  key={subject}
                  onClick={() => setSelectedSubject(subject)}
                  disabled={isPending}
                  className={cn(
                    'flex-shrink-0 rounded-full border-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-all',
                    selectedSubject === subject
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-text border-gray-200 hover:border-gray-300',
                  )}
                >
                  {selectedSubject === subject && <Check className='mr-1 inline h-4 w-4' />}
                  {subject}
                </button>
              ))}
            </div>

            {/* 에러 메시지 */}
            {error && <p className='text-error mt-3 px-4 text-sm'>{error}</p>}
          </div>
        </div>

        {/* 버튼 - 항상 하단에 고정, BottomNav + 안전 영역 위로 띄움 */}
        <div className='pb-safe-nav flex flex-shrink-0 gap-3 border-t border-gray-100 bg-white p-4'>
          <button
            onClick={resetAndClose}
            disabled={isPending}
            className='text-text flex-1 rounded-xl border border-gray-200 px-4 py-3 font-medium transition-colors hover:bg-gray-50'
          >
            취소
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedSubject || selectedMinutes === 0 || isPending}
            className={cn(
              'flex-1 rounded-xl px-4 py-3 font-medium transition-colors',
              selectedSubject && selectedMinutes > 0 && !isPending
                ? 'bg-primary hover:bg-primary/90 text-white'
                : 'cursor-not-allowed bg-gray-200 text-gray-400',
            )}
          >
            {isPending ? '처리 중...' : `${selectedMinutes}분 할당`}
          </button>
        </div>
      </div>
    </div>
  );
}
