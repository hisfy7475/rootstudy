'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ChatMessageItem } from './chat-message-item';
import { format, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';

export interface ChatMessageData {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  content: string;
  image_url?: string | null;
  is_read_by_student: boolean;
  is_read_by_parent: boolean;
  is_read_by_admin: boolean;
  created_at: string;
}

interface ChatMessageListProps {
  messages: ChatMessageData[];
  currentUserId: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export function ChatMessageList({
  messages,
  currentUserId,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const prevScrollHeightRef = useRef(0);

  // 초기 마운트 시 맨 아래로 (instant), 이후 새 메시지 시 smooth
  useEffect(() => {
    if (isInitialMount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      isInitialMount.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // 이전 메시지 로드 후 스크롤 위치 복원
  useEffect(() => {
    const container = containerRef.current;
    if (!container || prevScrollHeightRef.current === 0) return;
    const newScrollHeight = container.scrollHeight;
    const diff = newScrollHeight - prevScrollHeightRef.current;
    if (diff > 0) {
      container.scrollTop += diff;
    }
    prevScrollHeightRef.current = 0;
  }, [messages]);

  // 상단 IntersectionObserver로 이전 메시지 로드 트리거
  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || !onLoadMore || !containerRef.current) return;
    prevScrollHeightRef.current = containerRef.current.scrollHeight;
    onLoadMore();
  }, [hasMore, isLoadingMore, onLoadMore]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { root: containerRef.current, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, handleLoadMore]);

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
      {/* 상단 센티널: 이전 메시지 로드 트리거 */}
      <div ref={topSentinelRef} className="h-1" />
      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
        </div>
      )}

      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showDateDivider = shouldShowDateDivider(message, prevMessage);

        return (
          <div key={message.id}>
            {showDateDivider && (
              <div className="flex items-center justify-center my-4">
                <div className="bg-gray-200 text-text-muted text-xs px-3 py-1 rounded-full">
                  {format(new Date(message.created_at), 'yyyy년 M월 d일 EEEE', {
                    locale: ko,
                  })}
                </div>
              </div>
            )}

            <ChatMessageItem
              id={message.id}
              content={message.content}
              imageUrl={message.image_url}
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
