'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value: { hour: number; minute: number };
  onChange: (value: { hour: number; minute: number }) => void;
  className?: string;
}

export function TimePicker({ value, onChange, className }: TimePickerProps) {
  const [selectedHour, setSelectedHour] = useState(value.hour);
  const [selectedMinute, setSelectedMinute] = useState(value.minute);
  
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 10, 20, 30, 40, 50];

  useEffect(() => {
    onChange({ hour: selectedHour, minute: selectedMinute });
  }, [selectedHour, selectedMinute, onChange]);

  // 스크롤 위치 초기화
  useEffect(() => {
    if (hourRef.current) {
      const hourElement = hourRef.current.querySelector(`[data-hour="${selectedHour}"]`);
      hourElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    if (minuteRef.current) {
      const minuteElement = minuteRef.current.querySelector(`[data-minute="${selectedMinute}"]`);
      minuteElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      {/* 시간 선택 */}
      <div className="relative">
        <div 
          ref={hourRef}
          className="h-48 w-20 overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        >
          <div className="py-20">
            {hours.map((hour) => (
              <button
                key={hour}
                data-hour={hour}
                onClick={() => setSelectedHour(hour)}
                className={cn(
                  'w-full py-3 text-center snap-center transition-all',
                  'text-2xl font-semibold',
                  selectedHour === hour
                    ? 'text-primary scale-110'
                    : 'text-text-muted hover:text-text'
                )}
              >
                {hour.toString().padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
        {/* 선택 영역 하이라이트 */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 bg-primary/10 rounded-xl pointer-events-none" />
      </div>

      <span className="text-3xl font-bold text-text-muted">:</span>

      {/* 분 선택 */}
      <div className="relative">
        <div 
          ref={minuteRef}
          className="h-48 w-20 overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        >
          <div className="py-20">
            {minutes.map((minute) => (
              <button
                key={minute}
                data-minute={minute}
                onClick={() => setSelectedMinute(minute)}
                className={cn(
                  'w-full py-3 text-center snap-center transition-all',
                  'text-2xl font-semibold',
                  selectedMinute === minute
                    ? 'text-primary scale-110'
                    : 'text-text-muted hover:text-text'
                )}
              >
                {minute.toString().padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
        {/* 선택 영역 하이라이트 */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-12 bg-primary/10 rounded-xl pointer-events-none" />
      </div>
    </div>
  );
}
