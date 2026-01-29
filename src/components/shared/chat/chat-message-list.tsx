'use client';

import { useEffect, useRef } from 'react';
import { ChatMessageItem } from './chat-message-item';
import { format, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';

export interface ChatMessageData {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  content: string;
  is_read_by_student: boolean;
  is_read_by_parent: boolean;
  is_read_by_admin: boolean;
  created_at: string;
}

interface ChatMessageListProps {
  messages: ChatMessageData[];
  currentUserId: string;
}

export function ChatMessageList({ messages, currentUserId }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 추가되면 스크롤 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 날짜 구분선 렌더링을 위한 함수
  const shouldShowDateDivider = (
    currentMsg: ChatMessageData,
    prevMsg: ChatMessageData | null
  ) => {
    if (!prevMsg) return true;
    return !isSameDay(new Date(currentMsg.created_at), new Date(prevMsg.created_at));
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-text-muted">
          <p className="text-lg mb-2">아직 메시지가 없습니다</p>
          <p className="text-sm">첫 메시지를 보내보세요!</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-3"
    >
      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showDateDivider = shouldShowDateDivider(message, prevMessage);

        return (
          <div key={message.id}>
            {/* 날짜 구분선 */}
            {showDateDivider && (
              <div className="flex items-center justify-center my-4">
                <div className="bg-gray-200 text-text-muted text-xs px-3 py-1 rounded-full">
                  {format(new Date(message.created_at), 'yyyy년 M월 d일 EEEE', {
                    locale: ko,
                  })}
                </div>
              </div>
            )}

            {/* 메시지 */}
            <ChatMessageItem
              id={message.id}
              content={message.content}
              senderName={message.sender_name}
              senderType={message.sender_type}
              createdAt={message.created_at}
              isOwn={message.sender_id === currentUserId}
            />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
