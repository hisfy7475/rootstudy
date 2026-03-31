'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import Image from 'next/image';
import { X } from 'lucide-react';

interface ChatMessageItemProps {
  id: string;
  content: string;
  imageUrl?: string | null;
  senderName: string;
  senderType: 'student' | 'parent' | 'admin' | string;
  createdAt: string;
  isOwn: boolean;
}

const senderTypeLabels: Record<string, string> = {
  student: '학생',
  parent: '학부모',
  admin: '관리자',
};

const senderTypeColors: Record<string, string> = {
  student: 'text-primary',
  parent: 'text-secondary',
  admin: 'text-accent',
};

const LONG_PRESS_MS = 500;

export function ChatMessageItem({
  content,
  imageUrl,
  senderName,
  senderType,
  createdAt,
  isOwn,
}: ChatMessageItemProps) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [copiedHint, setCopiedHint] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const timeString = format(new Date(createdAt), 'a h:mm', { locale: ko });
  const typeLabel = senderTypeLabels[senderType] || senderType;
  const typeColor = senderTypeColors[senderType] || 'text-gray-500';

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  const copyContent = useCallback(async () => {
    const text = content.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2000);
    } catch {
      window.alert('복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
    }
  }, [content]);

  const onTextPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        void copyContent();
      }, LONG_PRESS_MS);
    },
    [clearLongPressTimer, copyContent]
  );

  const onTextPointerEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  return (
    <>
      <div
        className={cn(
          'relative flex flex-col gap-1 max-w-[80%]',
          isOwn ? 'items-end ml-auto' : 'items-start mr-auto'
        )}
      >
        {copiedHint && (
          <div
            className={cn(
              'absolute -top-9 z-10 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-xs text-white shadow-md',
              isOwn ? 'right-0' : 'left-0'
            )}
            role="status"
          >
            복사되었습니다
          </div>
        )}
        {/* 발신자 정보 (본인 메시지가 아닐 때만) */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-xs font-medium text-text">{senderName}</span>
            <span className={cn('text-xs', typeColor)}>({typeLabel})</span>
          </div>
        )}

        {/* 메시지 버블 + 시간 */}
        <div className={cn('flex items-end gap-2', isOwn && 'flex-row-reverse')}>
          <div
            className={cn(
              'rounded-2xl overflow-hidden',
              isOwn
                ? 'bg-primary text-white rounded-br-md'
                : 'bg-gray-100 text-text rounded-bl-md',
              imageUrl ? 'p-1' : 'px-4 py-2.5'
            )}
          >
            {/* 이미지 */}
            {imageUrl && (
              <div 
                className="relative cursor-pointer mb-1"
                onClick={() => setShowFullImage(true)}
              >
                <Image
                  src={imageUrl}
                  alt="채팅 이미지"
                  width={200}
                  height={200}
                  className="rounded-xl object-cover max-w-[200px] max-h-[200px]"
                  style={{ width: 'auto', height: 'auto' }}
                />
              </div>
            )}
            {/* 텍스트 내용 */}
            {content && (
              <div
                title="길게 눌러 복사"
                className={cn(
                  'select-text break-words whitespace-pre-wrap touch-manipulation',
                  imageUrl && 'px-3 py-2'
                )}
                onPointerDown={onTextPointerDown}
                onPointerUp={onTextPointerEnd}
                onPointerCancel={onTextPointerEnd}
                onPointerLeave={onTextPointerEnd}
              >
                {content}
              </div>
            )}
          </div>
          <span className="text-xs text-text-muted flex-shrink-0">{timeString}</span>
        </div>
      </div>

      {/* 이미지 전체보기 모달 */}
      {showFullImage && imageUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <button
            onClick={() => setShowFullImage(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <Image
            src={imageUrl}
            alt="채팅 이미지 전체보기"
            width={800}
            height={800}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
