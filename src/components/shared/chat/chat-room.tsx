'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessageList, ChatMessageData } from './chat-message-list';
import { ChatInput } from './chat-input';
import { sendMessage, markAsRead, uploadChatImage, getOlderMessages } from '@/lib/actions/chat';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';

interface ChatRoomProps {
  roomId: string;
  initialMessages: ChatMessageData[];
  initialHasMore?: boolean;
  currentUserId: string;
  currentUserType: 'student' | 'parent' | 'admin';
  currentUserName?: string;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBackButton?: boolean;
}

// 참여자 프로필 캐시 (Realtime에서 추가 쿼리 방지)
type ProfileCache = Map<string, { name: string; user_type: string }>;

export function ChatRoom({
  roomId,
  initialMessages,
  initialHasMore = false,
  currentUserId,
  currentUserType,
  currentUserName = '나',
  title = '채팅',
  subtitle,
  onBack,
  showBackButton = false,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const pendingMessageIds = useRef<Set<string>>(new Set());
  const profileCacheRef = useRef<ProfileCache>(new Map());

  // initialMessages로부터 프로필 캐시 구성
  useEffect(() => {
    const cache = profileCacheRef.current;
    initialMessages.forEach((msg) => {
      if (!cache.has(msg.sender_id)) {
        cache.set(msg.sender_id, {
          name: msg.sender_name,
          user_type: msg.sender_type,
        });
      }
    });
  }, [initialMessages]);

  // initialMessages가 변경되면 state 동기화 (관리자가 다른 채팅방 선택 시)
  useEffect(() => {
    setMessages(initialMessages);
    setHasMore(initialHasMore);
  }, [initialMessages, initialHasMore]);

  // 이전 메시지 로드 (상단 무한스크롤)
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const oldestMessage = messages[0];
      const result = await getOlderMessages(roomId, oldestMessage.created_at);
      if (result.data && result.data.length > 0) {
        result.data.forEach((msg) => {
          if (!profileCacheRef.current.has(msg.sender_id)) {
            profileCacheRef.current.set(msg.sender_id, {
              name: msg.sender_name,
              user_type: msg.sender_type,
            });
          }
        });
        setMessages((prev) => [...result.data!, ...prev]);
        setHasMore(result.hasMore ?? false);
      } else {
        setHasMore(false);
      }
    } catch {
      console.error('Failed to load older messages');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, messages, roomId]);

  // Realtime 구독 (프로필 캐시 활용)
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
          if (pendingMessageIds.current.has(payload.new.id)) {
            pendingMessageIds.current.delete(payload.new.id);
            return;
          }

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
            image_url: payload.new.image_url,
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
          if (senderId !== currentUserId) {
            markAsRead(roomId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId]);

  // 채팅방 진입 시 1회 읽음 처리
  useEffect(() => {
    markAsRead(roomId);
  }, [roomId]);

  // 메시지 전송
  const handleSend = useCallback(
    async (content: string, imageFile?: File | null) => {
      setIsSending(true);
      
      let imageUrl: string | null = null;
      let tempImagePreview: string | null = null;

      if (imageFile) {
        tempImagePreview = URL.createObjectURL(imageFile);

        const formData = new FormData();
        formData.append('file', imageFile);
        
        const uploadResult = await uploadChatImage(roomId, formData);
        if (uploadResult.error) {
          console.error('Image upload error:', uploadResult.error);
          alert(uploadResult.error);
          setIsSending(false);
          if (tempImagePreview) URL.revokeObjectURL(tempImagePreview);
          return;
        }
        imageUrl = uploadResult.data?.url || null;
      }
      
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: ChatMessageData = {
        id: tempId,
        room_id: roomId,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_type: currentUserType,
        content: content,
        image_url: imageUrl || tempImagePreview,
        is_read_by_student: currentUserType === 'student',
        is_read_by_parent: currentUserType === 'parent',
        is_read_by_admin: currentUserType === 'admin',
        created_at: new Date().toISOString(),
      };
      
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const result = await sendMessage(roomId, content, imageUrl);
        if (result.error) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          console.error('Send message error:', result.error);
          alert(result.error);
        } else if (result.data) {
          pendingMessageIds.current.add(result.data.id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { 
                    ...m, 
                    id: result.data!.id, 
                    created_at: result.data!.created_at,
                    image_url: result.data!.image_url 
                  }
                : m
            )
          );
        }
      } catch (error) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        console.error('Send message error:', error);
        alert('메시지 전송에 실패했습니다.');
      } finally {
        setIsSending(false);
        if (tempImagePreview) URL.revokeObjectURL(tempImagePreview);
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
      <ChatMessageList
        messages={messages}
        currentUserId={currentUserId}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
      />

      {/* 입력창 */}
      <ChatInput onSend={handleSend} disabled={isSending} />
    </div>
  );
}
