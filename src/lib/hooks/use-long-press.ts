'use client';

import { useCallback, useEffect, useRef } from 'react';

interface UseLongPressOptions {
  delayMs?: number;
  moveThresholdPx?: number;
  onLongPress: () => void;
}

interface UseLongPressHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * 모바일 longpress 인터랙션 훅.
 * - 350ms 임계치는 iOS Safari/WKWebView의 OS 텍스트 선택 메뉴(약 500ms)보다 빠르게 트리거.
 * - 활성 중에는 user-select 를 일시 차단해 OS 메뉴와의 중첩을 회피.
 * - 손가락 이동이 10px 초과하면 longpress 취소(스크롤과의 충돌 방지).
 */
export function useLongPress({
  delayMs = 350,
  moveThresholdPx = 10,
  onLongPress,
}: UseLongPressOptions): UseLongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const prevUserSelectRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (prevUserSelectRef.current !== null) {
      document.body.style.userSelect = prevUserSelectRef.current;
      prevUserSelectRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startRef.current = { x: t.clientX, y: t.clientY };

      prevUserSelectRef.current = document.body.style.userSelect;
      document.body.style.userSelect = 'none';

      timerRef.current = setTimeout(() => {
        onLongPress();
        timerRef.current = null;
      }, delayMs);
    },
    [delayMs, onLongPress],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t || !startRef.current) return;
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > moveThresholdPx) {
        clearTimer();
      }
    },
    [moveThresholdPx, clearTimer],
  );

  const onTouchEnd = useCallback(() => {
    clearTimer();
    startRef.current = null;
  }, [clearTimer]);

  const onTouchCancel = useCallback(() => {
    clearTimer();
    startRef.current = null;
  }, [clearTimer]);

  // 데스크탑 우클릭도 동일 트리거로 매핑
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress();
    },
    [onLongPress],
  );

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onContextMenu };
}
