'use client';

import { useState } from 'react';
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

export function ChatMessageItem({
  content,
  imageUrl,
  senderName,
  senderType,
  createdAt,
  isOwn,
}: ChatMessageItemProps) {
  const [showFullImage, setShowFullImage] = useState(false);
  const timeString = format(new Date(createdAt), 'a h:mm', { locale: ko });
  const typeLabel = senderTypeLabels[senderType] || senderType;
  const typeColor = senderTypeColors[senderType] || 'text-gray-500';

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-1 max-w-[80%]',
          isOwn ? 'items-end ml-auto' : 'items-start mr-auto'
        )}
      >
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
              <div className={cn(
                'break-words whitespace-pre-wrap',
                imageUrl && 'px-3 py-2'
              )}>
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
