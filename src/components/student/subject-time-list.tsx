'use client';

import { cn } from '@/lib/utils';
import { ChevronRight, HelpCircle } from 'lucide-react';
import { REWARD_RULES } from '@/lib/constants';

interface UnclassifiedSegment {
  id: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

interface SubjectTimeListProps {
  subjectTimes: Record<string, number>;
  unclassifiedSeconds: number;
  unclassifiedSegments: UnclassifiedSegment[];
  totalSeconds: number;
  onUnclassifiedClick?: (segment: UnclassifiedSegment) => void;
}

const MIN_SEGMENT_SECONDS = REWARD_RULES.dailyFocusMinSegmentSeconds;

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

// 과목별 색상 팔레트
const subjectColors = [
  'from-blue-500 to-blue-400',
  'from-green-500 to-green-400',
  'from-purple-500 to-purple-400',
  'from-orange-500 to-orange-400',
  'from-pink-500 to-pink-400',
  'from-cyan-500 to-cyan-400',
  'from-indigo-500 to-indigo-400',
  'from-rose-500 to-rose-400',
];

export function SubjectTimeList({
  subjectTimes,
  unclassifiedSeconds,
  unclassifiedSegments,
  totalSeconds,
  onUnclassifiedClick,
}: SubjectTimeListProps) {
  // 과목별 학습시간 정렬 (내림차순)
  const sortedSubjects = Object.entries(subjectTimes).sort(([, a], [, b]) => b - a);

  // 1분 미만 자투리는 클릭 가능 리스트/핸들러에서 제외 (헬퍼의 자투리 필터와 일치).
  // 총합 `unclassifiedSeconds` 는 prop 그대로 — 이미 헬퍼-derived 라 동일 기준으로 산출됨.
  const visibleSegments = unclassifiedSegments.filter(
    (s) => s.durationSeconds >= MIN_SEGMENT_SECONDS,
  );

  const allItems = [
    ...sortedSubjects.map(([name, seconds], index) => ({
      type: 'subject' as const,
      name,
      seconds,
      colorIndex: index % subjectColors.length,
    })),
    ...(unclassifiedSeconds > 0
      ? [
          {
            type: 'unclassified' as const,
            name: '미분류',
            seconds: unclassifiedSeconds,
            colorIndex: -1,
          },
        ]
      : []),
  ];

  const effectiveTotal = Math.max(
    totalSeconds,
    Object.values(subjectTimes).reduce((a, b) => a + b, 0) + unclassifiedSeconds,
  );

  return (
    <div className='space-y-3'>
      {allItems.map((item, index) => {
        const percentage =
          effectiveTotal > 0 ? Math.round((item.seconds / effectiveTotal) * 100) : 0;

        if (item.type === 'unclassified') {
          return (
            <div key='unclassified' className='space-y-2'>
              <button
                onClick={() => {
                  if (visibleSegments.length > 0 && onUnclassifiedClick) {
                    // 첫 번째 (1분 이상) 미분류 구간으로 모달 열기
                    onUnclassifiedClick(visibleSegments[0]);
                  }
                }}
                className='group w-full text-left'
              >
                <div className='mb-1 flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <HelpCircle className='h-4 w-4 text-orange-500' />
                    <span className='text-sm font-medium text-orange-500'>{item.name}</span>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='text-text-muted text-sm'>
                      {formatDuration(item.seconds)} ({percentage}%)
                    </span>
                    <ChevronRight className='h-4 w-4 text-orange-500 opacity-0 transition-opacity group-hover:opacity-100' />
                  </div>
                </div>
                <div className='h-2 overflow-hidden rounded-full bg-gray-100'>
                  <div
                    className='h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-300 transition-all duration-500'
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </button>

              {/* 미분류 구간 상세 (1분 이상만 노출) */}
              {visibleSegments.length > 0 && (
                <div className='ml-6 space-y-1'>
                  {visibleSegments.map((segment) => (
                    <button
                      key={segment.id}
                      onClick={() => onUnclassifiedClick?.(segment)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-2 py-1.5',
                        'text-text-muted bg-gray-50 text-xs hover:bg-orange-50',
                        'group transition-colors',
                      )}
                    >
                      <span>
                        {new Date(segment.startTime).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' ~ '}
                        {new Date(segment.endTime).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <div className='flex items-center gap-1'>
                        <span>{formatDuration(segment.durationSeconds)}</span>
                        <ChevronRight className='h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100' />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={item.name}>
            <div className='mb-1 flex items-center justify-between'>
              <span className='text-text text-sm font-medium'>{item.name}</span>
              <span className='text-text-muted text-sm'>
                {formatDuration(item.seconds)} ({percentage}%)
              </span>
            </div>
            <div className='h-2 overflow-hidden rounded-full bg-gray-100'>
              <div
                className={cn(
                  'h-full rounded-full bg-gradient-to-r transition-all duration-500',
                  subjectColors[item.colorIndex],
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
