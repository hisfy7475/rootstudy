'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TimerDisplayProps {
  startTime?: Date | null;
  isActive: boolean;
  className?: string;
}

export function TimerDisplay({ startTime, isActive, className }: TimerDisplayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive || !startTime) {
      return;
    }

    // 초기 경과 시간 계산
    const initialElapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
    setElapsed(initialElapsed);

    // 1초마다 업데이트
    const interval = setInterval(() => {
      const newElapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
      setElapsed(newElapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, startTime]);

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

  const time = formatTime(elapsed);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* 원형 타이머 배경 */}
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* 외곽 원 */}
        <div 
          className={cn(
            'absolute inset-0 rounded-full border-8 transition-all duration-300',
            isActive 
              ? 'border-primary/30 shadow-lg shadow-primary/20' 
              : 'border-gray-200'
          )}
        />
        
        {/* 내부 진행 표시 (펄스 애니메이션) */}
        {isActive && (
          <div className="absolute inset-4 rounded-full bg-primary/10 animate-pulse" />
        )}

        {/* 시간 표시 */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-baseline gap-1">
            <span className="text-5xl font-bold text-text tabular-nums">
              {time.hours}
            </span>
            <span className="text-3xl font-semibold text-text-muted">:</span>
            <span className="text-5xl font-bold text-text tabular-nums">
              {time.minutes}
            </span>
            <span className="text-3xl font-semibold text-text-muted">:</span>
            <span className="text-5xl font-bold text-primary tabular-nums">
              {time.seconds}
            </span>
          </div>
          <span className="mt-2 text-sm text-text-muted">
            오늘의 학습시간
          </span>
        </div>
      </div>
    </div>
  );
}
