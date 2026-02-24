'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getChatMessages, sendMessage as sendMessageAction, markAsRead } from '@/lib/actions/chat';
import { ChatMessageData } from '@/components/shared/chat';

interface UseChatOptions {
  roomId: string | null;
  currentUserId: string;
  autoMarkAsRead?: boolean;
}

type ProfileCache = Map<string, { name: string; user_type: string }>;

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
  const profileCacheRef = useRef<ProfileCache>(new Map());

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

  // Realtime 구독 (프로필 캐시 활용)
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
          const senderId = payload.new.sender_id as string;
          let cached = profileCacheRef.current.get(senderId);

          if (!cached) {
            const { data: senderProfile } = await supabase
              .from('profiles')
              .select('name, user_type')
              .eq('id', senderId)
              .single();
            cached = {
              name: senderProfile?.name || '알 수 없음',
              user_type: senderProfile?.user_type || 'unknown',
            };
            profileCacheRef.current.set(senderId, cached);
          }

          const senderName = cached.user_type === 'admin'
            ? '루트스터디센터'
            : cached.name;

          const newMessage: ChatMessageData = {
            id: payload.new.id,
            room_id: payload.new.room_id,
            sender_id: senderId,
            sender_name: senderName,
            sender_type: cached.user_type,
            content: payload.new.content,
            is_read_by_student: payload.new.is_read_by_student,
            is_read_by_parent: payload.new.is_read_by_parent,
            is_read_by_admin: payload.new.is_read_by_admin,
            created_at: payload.new.created_at,
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });

          // 타인 메시지 수신 시 읽음 처리
          if (autoMarkAsRead && senderId !== currentUserId) {
            markAsRead(roomId);
          }
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
  }, [roomId, autoMarkAsRead, currentUserId]);

  // 진입 시 1회 읽음 처리
  useEffect(() => {
    if (autoMarkAsRead && roomId) {
      markAsRead(roomId);
    }
  }, [autoMarkAsRead, roomId]);

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

  // Realtime 구독 (부분 갱신 + 새 채팅방만 전체 재조회)
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
        (payload) => {
          const msgRoomId = payload.new.room_id as string;
          const msgContent = payload.new.content as string;
          const msgCreatedAt = payload.new.created_at as string;

          setRooms((prev) => {
            const exists = prev.some((r) => r.id === msgRoomId);
            if (!exists) {
              refreshRooms();
              return prev;
            }
            const updated = prev.map((r) =>
              r.id === msgRoomId
                ? {
                    ...r,
                    last_message: msgContent,
                    last_message_at: msgCreatedAt,
                    unread_count: r.unread_count + 1,
                  }
                : r
            );
            return updated.sort(
              (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            );
          });
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
