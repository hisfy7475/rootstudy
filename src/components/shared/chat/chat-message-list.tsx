'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ChatMessageItem } from './chat-message-item';
import { Loader2 } from 'lucide-react';

export interface ChatMessageData {
  id: string;
  room_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  content: string;
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
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

function dateKeyKST(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

function formatDividerLabelKST(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
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
  const prevMessagesRef = useRef<ChatMessageData[]>(messages);

  // 초기 마운트: 맨 아래. 이후: prepend가 아니고 맨 끝에 새 메시지가 붙었을 때만 맨 아래로
  useEffect(() => {
    const prev = prevMessagesRef.current;
    const prevLen = prev.length;
    const nextLen = messages.length;

    if (isInitialMount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      isInitialMount.current = false;
      prevMessagesRef.current = messages;
      return;
    }

    if (nextLen > prevLen) {
      const prepended =
        prevLen > 0 &&
        messages[0] &&
        prev[0] &&
        messages[0].id !== prev[0].id;

      if (!prepended) {
        const prevLast = prev[prevLen - 1]?.id;
        const nextLast = messages[nextLen - 1]?.id;
        if (nextLast !== prevLast) {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }

    prevMessagesRef.current = messages;
  }, [messages]);

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
    return dateKeyKST(currentMsg.created_at) !== dateKeyKST(prevMsg.created_at);
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
                  {formatDividerLabelKST(message.created_at)}
                </div>
              </div>
            )}

            <ChatMessageItem
              id={message.id}
              content={message.content}
              imageUrl={message.image_url}
              fileUrl={message.file_url}
              fileName={message.file_name}
              fileType={message.file_type}
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
