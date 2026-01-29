'use client';

import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ChatMessageItemProps {
  id: string;
  content: string;
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
  senderName,
  senderType,
  createdAt,
  isOwn,
}: ChatMessageItemProps) {
  const timeString = format(new Date(createdAt), 'a h:mm', { locale: ko });
  const typeLabel = senderTypeLabels[senderType] || senderType;
  const typeColor = senderTypeColors[senderType] || 'text-gray-500';

  return (
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
            'px-4 py-2.5 rounded-2xl break-words whitespace-pre-wrap',
            isOwn
              ? 'bg-primary text-white rounded-br-md'
              : 'bg-gray-100 text-text rounded-bl-md'
          )}
        >
          {content}
        </div>
        <span className="text-xs text-text-muted flex-shrink-0">{timeString}</span>
      </div>
    </div>
  );
}
