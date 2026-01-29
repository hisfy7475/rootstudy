'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessageList, ChatMessageData } from './chat-message-list';
import { ChatInput } from './chat-input';
import { sendMessage, markAsRead } from '@/lib/actions/chat';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';

interface ChatRoomProps {
  roomId: string;
  initialMessages: ChatMessageData[];
  currentUserId: string;
  currentUserType: 'student' | 'parent' | 'admin';
  currentUserName?: string;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBackButton?: boolean;
}

const userTypeLabels: Record<string, string> = {
  student: '학생',
  parent: '학부모',
  admin: '관리자',
};

export function ChatRoom({
  roomId,
  initialMessages,
  currentUserId,
  currentUserType,
  currentUserName = '나',
  title = '채팅',
  subtitle,
  onBack,
  showBackButton = false,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [isSending, setIsSending] = useState(false);
  const pendingMessageIds = useRef<Set<string>>(new Set());

  // Realtime 구독
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          // 이미 로컬에 추가된 메시지면 스킵 (본인이 보낸 메시지)
          if (pendingMessageIds.current.has(payload.new.id)) {
            pendingMessageIds.current.delete(payload.new.id);
            return;
          }

          // 새 메시지의 발신자 정보 가져오기
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('name, user_type')
            .eq('id', payload.new.sender_id)
            .single();

          const newMessage: ChatMessageData = {
            id: payload.new.id,
            room_id: payload.new.room_id,
            sender_id: payload.new.sender_id,
            sender_name: senderProfile?.name || '알 수 없음',
            sender_type: senderProfile?.user_type || 'unknown',
            content: payload.new.content,
            is_read_by_student: payload.new.is_read_by_student,
            is_read_by_parent: payload.new.is_read_by_parent,
            is_read_by_admin: payload.new.is_read_by_admin,
            created_at: payload.new.created_at,
          };

          // 중복 방지
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev;
            }
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // 읽음 표시
  useEffect(() => {
    markAsRead(roomId);
  }, [roomId, messages]);

  // 메시지 전송
  const handleSend = useCallback(
    async (content: string) => {
      setIsSending(true);
      
      // 낙관적 업데이트: 즉시 메시지를 로컬에 추가
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: ChatMessageData = {
        id: tempId,
        room_id: roomId,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_type: currentUserType,
        content: content,
        is_read_by_student: currentUserType === 'student',
        is_read_by_parent: currentUserType === 'parent',
        is_read_by_admin: currentUserType === 'admin',
        created_at: new Date().toISOString(),
      };
      
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const result = await sendMessage(roomId, content);
        if (result.error) {
          // 실패 시 낙관적 메시지 제거
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          console.error('Send message error:', result.error);
          alert(result.error);
        } else if (result.data) {
          // 성공 시 임시 ID를 실제 ID로 교체하고, Realtime에서 중복 방지
          pendingMessageIds.current.add(result.data.id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, id: result.data!.id, created_at: result.data!.created_at }
                : m
            )
          );
        }
      } catch (error) {
        // 실패 시 낙관적 메시지 제거
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        console.error('Send message error:', error);
        alert('메시지 전송에 실패했습니다.');
      } finally {
        setIsSending(false);
      }
    },
    [roomId, currentUserId, currentUserName, currentUserType]
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
        {showBackButton && onBack && (
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-text" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-text truncate">{title}</h2>
          {subtitle && (
            <p className="text-sm text-text-muted truncate">{subtitle}</p>
          )}
        </div>
      </div>

      {/* 메시지 목록 */}
      <ChatMessageList messages={messages} currentUserId={currentUserId} />

      {/* 입력창 */}
      <ChatInput onSend={handleSend} disabled={isSending} />
    </div>
  );
}
