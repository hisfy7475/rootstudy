'use client';

import { cn } from '@/lib/utils';
import { ChevronRight, HelpCircle } from 'lucide-react';

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
  const sortedSubjects = Object.entries(subjectTimes)
    .sort(([, a], [, b]) => b - a);

  const allItems = [
    ...sortedSubjects.map(([name, seconds], index) => ({
      type: 'subject' as const,
      name,
      seconds,
      colorIndex: index % subjectColors.length,
    })),
    ...(unclassifiedSeconds > 0 ? [{
      type: 'unclassified' as const,
      name: '미분류',
      seconds: unclassifiedSeconds,
      colorIndex: -1,
    }] : []),
  ];

  const effectiveTotal = Math.max(totalSeconds, Object.values(subjectTimes).reduce((a, b) => a + b, 0) + unclassifiedSeconds);

  return (
    <div className="space-y-3">
      {allItems.map((item, index) => {
        const percentage = effectiveTotal > 0 
          ? Math.round((item.seconds / effectiveTotal) * 100) 
          : 0;

        if (item.type === 'unclassified') {
          return (
            <div key="unclassified" className="space-y-2">
              <button
                onClick={() => {
                  if (unclassifiedSegments.length > 0 && onUnclassifiedClick) {
                    // 첫 번째 미분류 구간으로 모달 열기
                    onUnclassifiedClick(unclassifiedSegments[0]);
                  }
                }}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-warning" />
                    <span className="text-sm font-medium text-warning">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-muted">
                      {formatDuration(item.seconds)} ({percentage}%)
                    </span>
                    <ChevronRight className="w-4 h-4 text-warning opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-warning to-warning/70 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </button>
              
              {/* 미분류 구간 상세 */}
              {unclassifiedSegments.length > 0 && (
                <div className="ml-6 space-y-1">
                  {unclassifiedSegments.map((segment) => (
                    <button
                      key={segment.id}
                      onClick={() => onUnclassifiedClick?.(segment)}
                      className={cn(
                        'flex items-center justify-between w-full py-1.5 px-2 rounded-lg',
                        'text-xs text-text-muted bg-gray-50 hover:bg-warning/10',
                        'transition-colors group'
                      )}
                    >
                      <span>
                        {new Date(segment.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        {' ~ '}
                        {new Date(segment.endTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-1">
                        <span>{formatDuration(segment.durationSeconds)}</span>
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
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
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-text">{item.name}</span>
              <span className="text-sm text-text-muted">
                {formatDuration(item.seconds)} ({percentage}%)
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full bg-gradient-to-r rounded-full transition-all duration-500',
                  subjectColors[item.colorIndex]
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
