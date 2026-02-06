'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getChatMessages, sendMessage as sendMessageAction, markAsRead } from '@/lib/actions/chat';
import { ChatMessageData } from '@/components/shared/chat';

interface UseChatOptions {
  roomId: string | null;
  currentUserId: string;
  autoMarkAsRead?: boolean;
}

interface UseChatReturn {
  messages: ChatMessageData[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
}

export function useChat({
  roomId,
  currentUserId,
  autoMarkAsRead = true,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 메시지 목록 로드
  const refreshMessages = useCallback(async () => {
    if (!roomId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getChatMessages(roomId);
      if (result.error) {
        setError(result.error);
        setMessages([]);
      } else {
        setMessages(result.data || []);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError('메시지를 불러오는데 실패했습니다.');
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  // 초기 로드
  useEffect(() => {
    refreshMessages();
  }, [refreshMessages]);

  // Realtime 구독
  useEffect(() => {
    if (!roomId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`chat:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          // 새 메시지의 발신자 정보 가져오기
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('name, user_type')
            .eq('id', payload.new.sender_id)
            .single();

          // 관리자인 경우 '루트스터디센터'로 표시
          const senderName = senderProfile?.user_type === 'admin'
            ? '루트스터디센터'
            : (senderProfile?.name || '알 수 없음');

          const newMessage: ChatMessageData = {
            id: payload.new.id,
            room_id: payload.new.room_id,
            sender_id: payload.new.sender_id,
            sender_name: senderName,
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          // 읽음 상태 업데이트
          setMessages((prev) =>
            prev.map((m) =>
              m.id === payload.new.id
                ? {
                    ...m,
                    is_read_by_student: payload.new.is_read_by_student,
                    is_read_by_parent: payload.new.is_read_by_parent,
                    is_read_by_admin: payload.new.is_read_by_admin,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // 자동 읽음 표시
  useEffect(() => {
    if (autoMarkAsRead && roomId && messages.length > 0) {
      markAsRead(roomId);
    }
  }, [autoMarkAsRead, roomId, messages.length]);

  // 메시지 전송
  const sendMessage = useCallback(
    async (content: string) => {
      if (!roomId || !content.trim()) return;

      setIsSending(true);
      setError(null);

      try {
        const result = await sendMessageAction(roomId, content);
        if (result.error) {
          setError(result.error);
          throw new Error(result.error);
        }
        // 성공 시 메시지는 Realtime을 통해 추가됨
      } catch (err) {
        console.error('Failed to send message:', err);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [roomId]
  );

  return {
    messages,
    isLoading,
    isSending,
    error,
    sendMessage,
    refreshMessages,
  };
}

// 채팅방 목록 실시간 업데이트 훅 (관리자용)
interface UseChatRoomsOptions {
  enabled?: boolean;
}

interface ChatRoomItem {
  id: string;
  student_id: string;
  student_name: string;
  seat_number: number | null;
  unread_count: number;
  last_message: string | null;
  last_message_at: string;
  created_at: string;
}

interface UseChatRoomsReturn {
  rooms: ChatRoomItem[];
  isLoading: boolean;
  error: string | null;
  refreshRooms: () => Promise<void>;
}

export function useChatRooms({ enabled = true }: UseChatRoomsOptions = {}): UseChatRoomsReturn {
  const [rooms, setRooms] = useState<ChatRoomItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshRooms = useCallback(async () => {
    if (!enabled) {
      setRooms([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Server Action import를 동적으로 처리
      const { getChatRoomList } = await import('@/lib/actions/chat');
      const result = await getChatRoomList();
      
      if (result.error) {
        setError(result.error);
        setRooms([]);
      } else {
        setRooms(result.data || []);
      }
    } catch (err) {
      console.error('Failed to load chat rooms:', err);
      setError('채팅방 목록을 불러오는데 실패했습니다.');
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  // 초기 로드
  useEffect(() => {
    refreshRooms();
  }, [refreshRooms]);

  // Realtime 구독 (새 메시지 감지)
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    const channel = supabase
      .channel('chat_rooms_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        () => {
          // 새 메시지가 오면 목록 새로고침
          refreshRooms();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_rooms',
        },
        () => {
          // 새 채팅방이 생성되면 목록 새로고침
          refreshRooms();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, refreshRooms]);

  return {
    rooms,
    isLoading,
    error,
    refreshRooms,
  };
}
