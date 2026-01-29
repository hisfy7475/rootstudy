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

      const result = await assignUnclassifiedTime(
        startTime,
        endTime,
        selectedSubject
      );

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
    setSelectedMinutes(prev => {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 배경 오버레이 */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={resetAndClose}
      />
      
      {/* 모달 콘텐츠 */}
      <div className="relative bg-white rounded-t-3xl w-full max-w-lg animate-slide-up max-h-[85vh] overflow-y-auto">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 sticky top-0 bg-white">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-4 bg-white">
          <h2 className="text-lg font-bold text-text">미분류 시간 분류</h2>
          <button
            onClick={resetAndClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* 시간 정보 */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 p-3 bg-warning/10 rounded-xl">
            <Clock className="w-5 h-5 text-warning flex-shrink-0" />
            <div>
              <p className="font-medium text-text">
                {format(startTime, 'M월 d일', { locale: ko })} {format(startTime, 'HH:mm')} ~ {format(endTime, 'HH:mm')}
              </p>
              <p className="text-sm text-text-muted">
                총 {formatDuration(segment.durationSeconds)}
              </p>
            </div>
          </div>
        </div>

        {/* 시간 선택 */}
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm font-medium text-text-muted mb-3">
            할당할 시간 선택
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => handleMinutesChange(-5)}
              disabled={isPending || selectedMinutes <= 5}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                selectedMinutes <= 5
                  ? 'bg-gray-100 text-gray-300'
                  : 'bg-gray-100 text-text hover:bg-gray-200'
              )}
            >
              <Minus className="w-5 h-5" />
            </button>
            
            <div className="text-center min-w-[120px]">
              <p className="text-3xl font-bold text-primary">{selectedMinutes}분</p>
              {calculatedEndTime && (
                <p className="text-xs text-text-muted mt-1">
                  {format(startTime, 'HH:mm')} ~ {format(calculatedEndTime, 'HH:mm')}
                </p>
              )}
            </div>
            
            <button
              onClick={() => handleMinutesChange(5)}
              disabled={isPending || selectedMinutes >= totalMinutes}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                selectedMinutes >= totalMinutes
                  ? 'bg-gray-100 text-gray-300'
                  : 'bg-gray-100 text-text hover:bg-gray-200'
              )}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          
          {/* 빠른 선택 버튼 */}
          <div className="flex justify-center gap-2 mt-3">
            {[15, 30, 45, 60].filter(m => m <= totalMinutes).map((minutes) => (
              <button
                key={minutes}
                onClick={() => setSelectedMinutes(minutes)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  selectedMinutes === minutes
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-text-muted hover:bg-gray-200'
                )}
              >
                {minutes}분
              </button>
            ))}
            {totalMinutes > 5 && (
              <button
                onClick={() => setSelectedMinutes(totalMinutes)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  selectedMinutes === totalMinutes
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-text-muted hover:bg-gray-200'
                )}
              >
                전체
              </button>
            )}
          </div>
        </div>

        {/* 과목 선택 */}
        <div className="p-4">
          <p className="text-sm font-medium text-text-muted mb-3">
            과목 선택
          </p>
          <div className="grid grid-cols-3 gap-2">
            {subjects.map((subject) => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                disabled={isPending}
                className={cn(
                  'py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all',
                  selectedSubject === subject
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-text hover:border-gray-300'
                )}
              >
                {selectedSubject === subject && (
                  <Check className="w-4 h-4 inline mr-1" />
                )}
                {subject}
              </button>
            ))}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <p className="text-sm text-error mt-3">{error}</p>
          )}
        </div>

        {/* 버튼 - safe area 고려 */}
        <div className="p-4 pb-safe flex gap-3 sticky bottom-0 bg-white border-t border-gray-100">
          <button
            onClick={resetAndClose}
            disabled={isPending}
            className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-text font-medium hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedSubject || selectedMinutes === 0 || isPending}
            className={cn(
              'flex-1 py-3 px-4 rounded-xl font-medium transition-colors',
              selectedSubject && selectedMinutes > 0 && !isPending
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            {isPending ? '처리 중...' : `${selectedMinutes}분 할당`}
          </button>
        </div>
      </div>
    </div>
  );
}
