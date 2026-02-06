'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';

const PRESETS = [
  { label: '30분', minutes: 30 },
  { label: '60분', minutes: 60 },
  { label: '80분', minutes: 80 },
  { label: '90분', minutes: 90 },
  { label: '100분', minutes: 100 },
];

type TimerState = 'idle' | 'running' | 'paused' | 'finished';

interface ExamTimerProps {
  className?: string;
}

export function ExamTimer({ className }: ExamTimerProps) {
  const [totalSeconds, setTotalSeconds] = useState(0); // 설정된 총 시간 (초)
  const [remaining, setRemaining] = useState(0); // 남은 시간 (초)
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [customMinutes, setCustomMinutes] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 타이머 종료 처리
  const handleFinish = useCallback(() => {
    setTimerState('finished');
    setRemaining(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // 진동 알림
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  }, []);

  // 타이머 tick
  useEffect(() => {
    if (timerState !== 'running') return;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          handleFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timerState, handleFinish]);

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return {
      hours: hrs.toString().padStart(2, '0'),
      minutes: mins.toString().padStart(2, '0'),
      seconds: secs.toString().padStart(2, '0'),
    };
  };

  const handlePresetSelect = (minutes: number) => {
    const secs = minutes * 60;
    setTotalSeconds(secs);
    setRemaining(secs);
    setTimerState('idle');
    setCustomMinutes('');
  };

  const handleCustomSet = () => {
    const mins = parseInt(customMinutes, 10);
    if (mins > 0 && mins <= 999) {
      const secs = mins * 60;
      setTotalSeconds(secs);
      setRemaining(secs);
      setTimerState('idle');
    }
  };

  const handleStart = () => {
    if (remaining > 0) {
      setTimerState('running');
    }
  };

  const handlePause = () => {
    setTimerState('paused');
  };

  const handleReset = () => {
    setTimerState('idle');
    setRemaining(totalSeconds);
  };

  const handleFullReset = () => {
    setTimerState('idle');
    setTotalSeconds(0);
    setRemaining(0);
    setCustomMinutes('');
  };

  const time = formatTime(remaining);
  const progress = totalSeconds > 0 ? ((totalSeconds - remaining) / totalSeconds) * 100 : 0;

  // idle 상태이고 시간 미설정 → 프리셋 선택 화면
  if (totalSeconds === 0) {
    return (
      <div className={cn('flex flex-col items-center', className)}>
        <div className="relative w-44 h-44 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-[6px] border-gray-200" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <Clock className="w-8 h-8 text-text-muted" />
            <span className="text-xs text-text-muted">시간을 선택하세요</span>
          </div>
        </div>

        {/* 프리셋 버튼들 */}
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {PRESETS.map((preset) => (
            <button
              key={preset.minutes}
              onClick={() => handlePresetSelect(preset.minutes)}
              className="px-3 py-1.5 text-xs font-medium rounded-full bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 커스텀 입력 */}
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            placeholder="직접 입력"
            min={1}
            max={999}
            className="w-20 px-2.5 py-1.5 text-xs text-center border border-gray-200 rounded-lg focus:outline-none focus:border-secondary"
          />
          <span className="text-xs text-text-muted">분</span>
          <button
            onClick={handleCustomSet}
            disabled={!customMinutes || parseInt(customMinutes, 10) <= 0}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary text-white hover:bg-secondary/90 transition-colors disabled:opacity-40"
          >
            설정
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* 원형 타이머 */}
      <div className="relative w-44 h-44 flex items-center justify-center">
        {/* 배경 원 */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 176 176">
          <circle
            cx="88"
            cy="88"
            r="82"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-gray-200"
          />
          <circle
            cx="88"
            cy="88"
            r="82"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={2 * Math.PI * 82}
            strokeDashoffset={2 * Math.PI * 82 * (1 - progress / 100)}
            strokeLinecap="round"
            className={cn(
              'transition-all duration-1000',
              timerState === 'finished' ? 'text-error' : 'text-secondary'
            )}
          />
        </svg>

        {/* 종료 시 깜빡임 */}
        {timerState === 'finished' && (
          <div className="absolute inset-3 rounded-full bg-error/10 animate-pulse" />
        )}

        {/* 시간 표시 */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-baseline gap-0.5">
            <span className={cn(
              'text-3xl font-bold tabular-nums',
              timerState === 'finished' ? 'text-error' : 'text-text'
            )}>
              {time.hours}
            </span>
            <span className="text-2xl font-semibold text-text-muted">:</span>
            <span className={cn(
              'text-3xl font-bold tabular-nums',
              timerState === 'finished' ? 'text-error' : 'text-text'
            )}>
              {time.minutes}
            </span>
            <span className="text-2xl font-semibold text-text-muted">:</span>
            <span className={cn(
              'text-3xl font-bold tabular-nums',
              timerState === 'finished' ? 'text-error' : 'text-secondary'
            )}>
              {time.seconds}
            </span>
          </div>
          <span className="mt-1.5 text-xs text-text-muted">
            {timerState === 'finished' ? '시간 종료!' : '타이머'}
          </span>
        </div>
      </div>

      {/* 컨트롤 버튼 */}
      <div className="flex items-center gap-3 mt-4">
        {timerState === 'finished' ? (
          <button
            onClick={handleFullReset}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-gray-100 text-text-muted hover:bg-gray-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            다시 설정
          </button>
        ) : (
          <>
            {/* 리셋 */}
            <button
              onClick={handleReset}
              disabled={timerState === 'idle' && remaining === totalSeconds}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-text-muted hover:bg-gray-200 transition-colors disabled:opacity-30"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* 시작/일시정지 */}
            {timerState === 'running' ? (
              <button
                onClick={handlePause}
                className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary text-white shadow-md hover:bg-secondary/90 transition-colors"
              >
                <Pause className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary text-white shadow-md hover:bg-secondary/90 transition-colors"
              >
                <Play className="w-5 h-5 ml-0.5" />
              </button>
            )}

            {/* 전체 리셋 (다른 시간으로) */}
            <button
              onClick={handleFullReset}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-text-muted hover:bg-gray-200 transition-colors"
              title="시간 다시 설정"
            >
              <Clock className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
