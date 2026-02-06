'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SwipeableTimerProps {
  children: [ReactNode, ReactNode]; // 정확히 2개의 패널
  labels?: [string, string];
  className?: string;
}

const SWIPE_THRESHOLD = 50; // px

export function SwipeableTimer({ children, labels = ['순공시간', '타이머'], className }: SwipeableTimerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;

    // 경계 제한: 첫 페이지에서 오른쪽, 마지막 페이지에서 왼쪽 스와이프 제한
    if (activeIndex === 0 && diff > 0) {
      setTranslateX(diff * 0.3); // 저항감
      return;
    }
    if (activeIndex === 1 && diff < 0) {
      setTranslateX(diff * 0.3);
      return;
    }
    setTranslateX(diff);
  }, [isDragging, activeIndex]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    const diff = currentXRef.current - startXRef.current;

    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff < 0 && activeIndex === 0) {
        setActiveIndex(1);
      } else if (diff > 0 && activeIndex === 1) {
        setActiveIndex(0);
      }
    }
    setTranslateX(0);
  }, [activeIndex]);

  return (
    <div className={cn('relative', className)}>
      {/* 탭 라벨 */}
      <div className="flex justify-center gap-6 mb-3">
        {labels.map((label, index) => (
          <button
            key={label}
            onClick={() => setActiveIndex(index)}
            className={cn(
              'text-xs font-medium pb-1 border-b-2 transition-all',
              activeIndex === index
                ? 'text-primary border-primary'
                : 'text-text-muted border-transparent'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 스와이프 영역 */}
      <div
        ref={containerRef}
        className="overflow-hidden touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={cn(
            'flex',
            !isDragging && 'transition-transform duration-300 ease-out'
          )}
          style={{
            transform: `translateX(calc(-${activeIndex * 100}% + ${translateX}px))`,
          }}
        >
          {children.map((child, index) => (
            <div
              key={index}
              className="w-full flex-shrink-0"
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* 인디케이터 dots */}
      <div className="flex justify-center gap-1.5 mt-3">
        {[0, 1].map((index) => (
          <button
            key={index}
            onClick={() => setActiveIndex(index)}
            className={cn(
              'rounded-full transition-all duration-300',
              activeIndex === index
                ? 'w-5 h-1.5 bg-primary'
                : 'w-1.5 h-1.5 bg-gray-300'
            )}
          />
        ))}
      </div>
    </div>
  );
}
