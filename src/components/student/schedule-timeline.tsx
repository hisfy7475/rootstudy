'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { DAY_NAMES, DAY_CONFIG } from '@/lib/constants';
import type { StudentAbsenceSchedule } from '@/types/database';

interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
}

interface DragSelection {
  dayOfWeek: number;
  startSlot: number;
  endSlot: number;
}

interface ScheduleTimelineProps {
  schedules: StudentAbsenceSchedule[];
  onTimeSelect: (dayOfWeek: number, startTime: string, endTime: string) => void;
  onScheduleClick: (schedule: StudentAbsenceSchedule) => void;
}

// 타임라인 전용 설정 (화면에 보여줄 시간 범위)
const TIMELINE_CONFIG = {
  startHour: DAY_CONFIG.startHour,
  startMinute: DAY_CONFIG.startMinute,
  endHour: 22, // 밤 10시까지만 표시
  endMinute: 0,
};

// 시간 슬롯 생성 (07:30 ~ 22:00, 30분 단위)
function generateTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  let hour: number = TIMELINE_CONFIG.startHour;
  let minute: number = TIMELINE_CONFIG.startMinute;
  const endHour: number = TIMELINE_CONFIG.endHour;
  const endMinute: number = TIMELINE_CONFIG.endMinute;
  
  while (hour < endHour || (hour === endHour && minute <= endMinute)) {
    const displayHour = hour >= 24 ? hour - 24 : hour;
    const label = `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    slots.push({ hour, minute, label });
    
    minute += 30;
    if (minute >= 60) {
      minute = 0;
      hour++;
    }
  }
  
  return slots;
}

// 시간 문자열을 슬롯 인덱스로 변환
function timeToSlotIndex(timeStr: string, slots: TimeSlot[]): number {
  const [h, m] = timeStr.split(':').map(Number);
  // 타임라인 범위(22:00까지) 밖의 시간은 -1 반환
  if (h >= TIMELINE_CONFIG.endHour) return -1;
  
  return slots.findIndex(slot => 
    slot.hour === h && slot.minute === (m >= 30 ? 30 : 0)
  );
}

// 슬롯 인덱스를 시간 문자열로 변환
function slotIndexToTime(index: number, slots: TimeSlot[]): string {
  const slot = slots[index];
  if (!slot) return '00:00';
  const displayHour = slot.hour >= 24 ? slot.hour - 24 : slot.hour;
  return `${displayHour.toString().padStart(2, '0')}:${slot.minute.toString().padStart(2, '0')}`;
}

const TIME_SLOTS = generateTimeSlots();
const SLOT_HEIGHT = 20; // 각 슬롯 높이 (px) - 촘촘하게 표시
const LONG_PRESS_DELAY = 300; // 롱프레스 감지 시간 (ms)

export default function ScheduleTimeline({
  schedules,
  onTimeSelect,
  onScheduleClick,
}: ScheduleTimelineProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);
  const [startSlot, setStartSlot] = useState<{ day: number; slot: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);

  // 마우스/터치 위치에서 요일과 슬롯 인덱스 계산
  const getPositionFromEvent = useCallback((clientX: number, clientY: number): { day: number; slot: number } | null => {
    if (!gridRef.current) return null;
    
    const rect = gridRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top + gridRef.current.scrollTop;
    
    // 시간 라벨 영역 제외 (첫 48px)
    const gridX = x - 48;
    if (gridX < 0) return null;
    
    const dayWidth = (rect.width - 48) / 7;
    const day = Math.floor(gridX / dayWidth);
    const slot = Math.floor(y / SLOT_HEIGHT);
    
    if (day < 0 || day > 6 || slot < 0 || slot >= TIME_SLOTS.length) return null;
    
    return { day, slot };
  }, []);

  // 롱프레스 타이머 취소
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsLongPressing(false);
  }, []);

  // 마우스 다운 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e.clientX, e.clientY);
    if (!pos) return;
    
    setIsDragging(true);
    setStartSlot(pos);
    setDragSelection({
      dayOfWeek: pos.day,
      startSlot: pos.slot,
      endSlot: pos.slot,
    });
  }, [getPositionFromEvent]);

  // 마우스 이동 핸들러
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !startSlot) return;
    
    const pos = getPositionFromEvent(e.clientX, e.clientY);
    if (!pos || pos.day !== startSlot.day) return;
    
    setDragSelection({
      dayOfWeek: startSlot.day,
      startSlot: Math.min(startSlot.slot, pos.slot),
      endSlot: Math.max(startSlot.slot, pos.slot),
    });
  }, [isDragging, startSlot, getPositionFromEvent]);

  // 마우스 업 핸들러
  const handleMouseUp = useCallback(() => {
    if (isDragging && dragSelection) {
      const startTime = slotIndexToTime(dragSelection.startSlot, TIME_SLOTS);
      const endTime = slotIndexToTime(dragSelection.endSlot + 1, TIME_SLOTS);
      onTimeSelect(dragSelection.dayOfWeek, startTime, endTime);
    }
    
    setIsDragging(false);
    setStartSlot(null);
    setDragSelection(null);
  }, [isDragging, dragSelection, onTimeSelect]);

  // 터치 시작 핸들러 - 롱프레스로 드래그 시작
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const pos = getPositionFromEvent(touch.clientX, touch.clientY);
    if (!pos) return;
    
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    // 롱프레스 타이머 시작
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressing(true);
      setIsDragging(true);
      setStartSlot(pos);
      setDragSelection({
        dayOfWeek: pos.day,
        startSlot: pos.slot,
        endSlot: pos.slot,
      });
      // 햅틱 피드백 (지원되는 경우)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, LONG_PRESS_DELAY);
  }, [getPositionFromEvent]);

  // 터치 이동 핸들러
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    // 롱프레스 대기 중에 손가락이 많이 움직이면 취소 (스크롤 의도)
    if (!isDragging && touchStartPosRef.current) {
      const moveX = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const moveY = Math.abs(touch.clientY - touchStartPosRef.current.y);
      if (moveX > 10 || moveY > 10) {
        cancelLongPress();
        return;
      }
    }
    
    if (!isDragging || !startSlot) return;
    
    // 드래그 중에는 스크롤 방지
    e.preventDefault();
    
    const pos = getPositionFromEvent(touch.clientX, touch.clientY);
    if (!pos || pos.day !== startSlot.day) return;
    
    setDragSelection({
      dayOfWeek: startSlot.day,
      startSlot: Math.min(startSlot.slot, pos.slot),
      endSlot: Math.max(startSlot.slot, pos.slot),
    });
  }, [isDragging, startSlot, getPositionFromEvent, cancelLongPress]);

  // 터치 종료 핸들러
  const handleTouchEnd = useCallback(() => {
    cancelLongPress();
    touchStartPosRef.current = null;
    
    if (isDragging && dragSelection) {
      const startTime = slotIndexToTime(dragSelection.startSlot, TIME_SLOTS);
      const endTime = slotIndexToTime(dragSelection.endSlot + 1, TIME_SLOTS);
      onTimeSelect(dragSelection.dayOfWeek, startTime, endTime);
    }
    
    setIsDragging(false);
    setStartSlot(null);
    setDragSelection(null);
  }, [isDragging, dragSelection, onTimeSelect, cancelLongPress]);

  // 터치 취소 핸들러
  const handleTouchCancel = useCallback(() => {
    cancelLongPress();
    touchStartPosRef.current = null;
    setIsDragging(false);
    setStartSlot(null);
    setDragSelection(null);
  }, [cancelLongPress]);

  // 마우스가 그리드 밖으로 나갔을 때
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, handleMouseUp]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // 활성화된 반복 일정만 필터링
  const activeRecurringSchedules = schedules.filter(s => s.is_active && s.is_recurring);

  // 일정의 블록 위치 계산
  const getScheduleBlockStyle = (schedule: StudentAbsenceSchedule, dayIndex: number) => {
    const startIndex = timeToSlotIndex(schedule.start_time, TIME_SLOTS);
    const endIndex = timeToSlotIndex(schedule.end_time, TIME_SLOTS);
    
    if (startIndex < 0 || endIndex < 0) return null;
    
    const top = startIndex * SLOT_HEIGHT;
    const height = (endIndex - startIndex) * SLOT_HEIGHT;
    // 시간 라벨 영역(48px)을 제외한 나머지 영역에서 요일별 위치 계산
    const left = `calc(48px + (100% - 48px) * ${dayIndex} / 7)`;
    const width = `calc((100% - 48px) / 7 - 4px)`;
    
    return { top, height, left, width };
  };

  return (
    <div className="relative border rounded-xl overflow-hidden bg-white">
      {/* 요일 헤더 */}
      <div className="flex border-b bg-gray-50 sticky top-0 z-20">
        <div className="w-12 flex-shrink-0 py-2 text-center text-xs text-gray-500 border-r">
          시간
        </div>
        {DAY_NAMES.map((day, index) => (
          <div
            key={day}
            className={`flex-1 py-2 text-center text-sm font-medium ${
              index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-gray-700'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 타임라인 그리드 */}
      <div
        ref={gridRef}
        className={`relative overflow-y-auto select-none ${isDragging ? 'touch-none' : ''}`}
        style={{ height: '480px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => isDragging && handleMouseUp()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* 시간 슬롯 */}
        {TIME_SLOTS.map((slot, index) => (
          <div key={index} className="flex" style={{ height: SLOT_HEIGHT }}>
            {/* 시간 라벨 */}
            <div className="w-12 flex-shrink-0 text-[10px] text-gray-400 text-right pr-2 border-r bg-gray-50 flex items-center justify-end">
              {slot.minute === 0 ? slot.label : ''}
            </div>
            {/* 요일별 셀 */}
            {DAY_NAMES.map((_, dayIndex) => (
              <div
                key={dayIndex}
                className={`flex-1 border-b border-r border-gray-100 ${
                  slot.minute === 0 ? 'border-b-gray-200' : ''
                }`}
              />
            ))}
          </div>
        ))}

        {/* 드래그 선택 영역 */}
        {dragSelection && (
          <div
            className={`absolute border-2 rounded pointer-events-none z-10 transition-colors ${
              isLongPressing 
                ? 'bg-primary/40 border-primary animate-pulse' 
                : 'bg-primary/30 border-primary'
            }`}
            style={{
              top: dragSelection.startSlot * SLOT_HEIGHT,
              height: (dragSelection.endSlot - dragSelection.startSlot + 1) * SLOT_HEIGHT,
              left: `calc(48px + (100% - 48px) * ${dragSelection.dayOfWeek} / 7)`,
              width: `calc((100% - 48px) / 7 - 4px)`,
            }}
          >
            {/* 선택 시간 표시 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-medium text-primary bg-white/80 px-1.5 py-0.5 rounded">
                {slotIndexToTime(dragSelection.startSlot, TIME_SLOTS)}~{slotIndexToTime(dragSelection.endSlot + 1, TIME_SLOTS)}
              </span>
            </div>
          </div>
        )}

        {/* 일정 블록들 */}
        {activeRecurringSchedules.map(schedule => (
          schedule.day_of_week?.map(dayIndex => {
            const style = getScheduleBlockStyle(schedule, dayIndex);
            if (!style) return null;
            
            return (
              <div
                key={`${schedule.id}-${dayIndex}`}
                className="absolute bg-primary/80 text-white text-[10px] px-1 py-0.5 rounded cursor-pointer hover:bg-primary transition-colors overflow-hidden z-10"
                style={{
                  top: style.top,
                  height: style.height,
                  left: style.left,
                  width: style.width,
                  minHeight: SLOT_HEIGHT,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onScheduleClick(schedule);
                }}
              >
                <div className="font-medium truncate">{schedule.title}</div>
                {style.height > SLOT_HEIGHT && (
                  <div className="text-white/80 truncate">
                    {schedule.start_time.slice(0, 5)}~{schedule.end_time.slice(0, 5)}
                  </div>
                )}
              </div>
            );
          })
        ))}
      </div>

      {/* 안내 문구 */}
      <div className="px-3 py-2 bg-gray-50 border-t text-xs text-gray-500 text-center">
        <span className="hidden sm:inline">드래그하여 새 부재 일정을 추가하세요</span>
        <span className="sm:hidden">길게 눌러서 드래그하면 일정을 추가할 수 있어요</span>
      </div>
    </div>
  );
}
