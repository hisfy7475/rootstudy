'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TimerDisplayProps {
  startTime?: Date | null;
  isActive: boolean;
  initialSeconds?: number;
  className?: string;
}

export function TimerDisplay({ startTime, isActive, initialSeconds = 0, className }: TimerDisplayProps) {
  const [currentSessionElapsed, setCurrentSessionElapsed] = useState(0);

  useEffect(() => {
    if (!isActive || !startTime) {
      setCurrentSessionElapsed(0);
      return;
    }

    const calculateSessionElapsed = () => 
      Math.floor((Date.now() - startTime.getTime()) / 1000);

    setCurrentSessionElapsed(calculateSessionElapsed());

    const interval = setInterval(() => {
      setCurrentSessionElapsed(calculateSessionElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, startTime]);

  const totalElapsed = initialSeconds + currentSessionElapsed;

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return {
      hours: hours.toString().padStart(2, '0'),
      minutes: minutes.toString().padStart(2, '0'),
      seconds: secs.toString().padStart(2, '0'),
    };
  };

  const time = formatTime(totalElapsed);
  const sessionTime = formatTime(currentSessionElapsed);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* 원형 타이머 배경 */}
      <div className="relative w-44 h-44 flex items-center justify-center">
        {/* 외곽 원 */}
        <div 
          className={cn(
            'absolute inset-0 rounded-full border-[6px] transition-all duration-300',
            isActive 
              ? 'border-primary/30 shadow-lg shadow-primary/20' 
              : 'border-gray-200'
          )}
        />
        
        {/* 내부 진행 표시 (펄스 애니메이션) */}
        {isActive && (
          <div className="absolute inset-3 rounded-full bg-primary/10 animate-pulse" />
        )}

        {/* 시간 표시 */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-baseline gap-0.5">
            <span className="text-3xl font-bold text-text tabular-nums">
              {time.hours}
            </span>
            <span className="text-2xl font-semibold text-text-muted">:</span>
            <span className="text-3xl font-bold text-text tabular-nums">
              {time.minutes}
            </span>
            <span className="text-2xl font-semibold text-text-muted">:</span>
            <span className="text-3xl font-bold text-primary tabular-nums">
              {time.seconds}
            </span>
          </div>
          <span className="mt-1.5 text-xs text-text-muted">
            당일 누적 공부시간
          </span>
        </div>
      </div>

      {/* 최종 입실후 공부시간 */}
      {isActive && (
        <div className="mt-2 flex items-center gap-1.5 bg-primary/5 rounded-xl px-4 py-2">
          <span className="text-xs text-text-muted">최종 입실후</span>
          <span className="text-sm font-semibold text-primary tabular-nums">
            {sessionTime.hours}:{sessionTime.minutes}:{sessionTime.seconds}
          </span>
        </div>
      )}
    </div>
  );
}
