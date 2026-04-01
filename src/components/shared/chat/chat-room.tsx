'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessageList, ChatMessageData } from './chat-message-list';
import { ChatInput } from './chat-input';
import {
  sendMessage,
  markAsRead,
  uploadChatImage,
  uploadChatFile,
  getOlderMessages,
  type ChatFileAttachment,
} from '@/lib/actions/chat';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils';
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
  const [realtimeBanner, setRealtimeBanner] = useState<string | null>(null);
  const [realtimeChannelGen, setRealtimeChannelGen] = useState(0);
  const realtimeRetryRef = useRef(0);
  const realtimeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    realtimeRetryRef.current = 0;
    setRealtimeChannelGen(0);
    setRealtimeBanner(null);
    if (realtimeRetryTimerRef.current) {
      clearTimeout(realtimeRetryTimerRef.current);
      realtimeRetryTimerRef.current = null;
    }
  }, [roomId]);

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

  // Realtime 구독 (에러 시 최대 3회 지수 백오프 재구독)
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const channel = supabase
      .channel(`room:${roomId}:${realtimeChannelGen}`)
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
            file_url: payload.new.file_url ?? null,
            file_name: payload.new.file_name ?? null,
            file_type: payload.new.file_type ?? null,
            is_read_by_student: payload.new.is_read_by_student,
            is_read_by_parent: payload.new.is_read_by_parent,
            is_read_by_admin: payload.new.is_read_by_admin,
            created_at: payload.new.created_at,
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });

          if (senderId !== currentUserId) {
            markAsRead(roomId);
          }
        }
      )
      .subscribe((status, err) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeBanner(null);
          realtimeRetryRef.current = 0;
          return;
        }
        if (status === 'CLOSED') {
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[ChatRoom] Realtime', status, err);
          if (realtimeRetryTimerRef.current) {
            clearTimeout(realtimeRetryTimerRef.current);
            realtimeRetryTimerRef.current = null;
          }
          const attempt = realtimeRetryRef.current;
          if (attempt < 3) {
            setRealtimeBanner('연결이 끊어졌습니다. 재연결 중…');
            realtimeRetryRef.current = attempt + 1;
            const delayMs = 1000 * Math.pow(2, attempt);
            realtimeRetryTimerRef.current = setTimeout(() => {
              if (!cancelled) {
                setRealtimeChannelGen((g) => g + 1);
              }
            }, delayMs);
          } else {
            setRealtimeBanner('실시간 연결에 실패했습니다. 페이지를 새로고침해 주세요.');
          }
        }
      });

    return () => {
      cancelled = true;
      if (realtimeRetryTimerRef.current) {
        clearTimeout(realtimeRetryTimerRef.current);
        realtimeRetryTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId, realtimeChannelGen]);

  // 네이티브: Storage 업로드 후 FILE_UPLOADED → 이미지 또는 파일 메시지 전송
  useEffect(() => {
    if (typeof window === 'undefined' || !isNativeApp()) return;

    const sendAfterNativeUpload = async (
      imageUrl: string | null,
      attachment: ChatFileAttachment | null
    ) => {
      setIsSending(true);
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: ChatMessageData = {
        id: tempId,
        room_id: roomId,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_type: currentUserType,
        content: '',
        image_url: imageUrl,
        file_url: attachment?.url ?? null,
        file_name: attachment?.fileName ?? null,
        file_type: attachment ? 'file' : imageUrl ? 'image' : null,
        is_read_by_student: currentUserType === 'student',
        is_read_by_parent: currentUserType === 'parent',
        is_read_by_admin: currentUserType === 'admin',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const result = await sendMessage(roomId, '', imageUrl, attachment);
        if (result.error) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
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
                    image_url: result.data!.image_url,
                    file_url: result.data!.file_url ?? m.file_url,
                    file_name: result.data!.file_name ?? m.file_name,
                    file_type: result.data!.file_type ?? m.file_type,
                  }
                : m
            )
          );
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        alert('메시지 전송에 실패했습니다.');
      } finally {
        setIsSending(false);
      }
    };

    const handler = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : null;
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as {
          type?: string;
          payload?: { url?: string; filename?: string; mime_type?: string };
        };
        if (parsed.type !== 'FILE_UPLOADED' || !parsed.payload?.url) return;
        const url = parsed.payload.url;
        const mime = parsed.payload.mime_type ?? '';
        const fileName = parsed.payload.filename?.trim() || '첨부파일';

        if (mime.startsWith('image/')) {
          void sendAfterNativeUpload(url, null);
        } else {
          void sendAfterNativeUpload(null, {
            url,
            fileName,
            mimeType: parsed.payload.mime_type ?? null,
          });
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [roomId, currentUserId, currentUserName, currentUserType]);

  // 채팅방 진입 시 1회 읽음 처리
  useEffect(() => {
    markAsRead(roomId);
  }, [roomId]);

  // 메시지 전송
  const handleSend = useCallback(
    async (content: string, imageFile?: File | null, dataFile?: File | null) => {
      setIsSending(true);

      let imageUrl: string | null = null;
      let tempImagePreview: string | null = null;
      let fileAttachment: ChatFileAttachment | null = null;

      if (imageFile && dataFile) {
        alert('이미지와 파일을 동시에 보낼 수 없습니다.');
        setIsSending(false);
        return;
      }

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

      if (dataFile) {
        const formData = new FormData();
        formData.append('file', dataFile);
        const uploadResult = await uploadChatFile(roomId, formData);
        if (uploadResult.error) {
          console.error('File upload error:', uploadResult.error);
          alert(uploadResult.error);
          setIsSending(false);
          if (tempImagePreview) URL.revokeObjectURL(tempImagePreview);
          return;
        }
        if (uploadResult.data) {
          fileAttachment = {
            url: uploadResult.data.url,
            fileName: uploadResult.data.fileName,
            mimeType: uploadResult.data.mimeType,
          };
        }
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
        file_url: fileAttachment?.url ?? null,
        file_name: fileAttachment?.fileName ?? null,
        file_type: fileAttachment ? 'file' : null,
        is_read_by_student: currentUserType === 'student',
        is_read_by_parent: currentUserType === 'parent',
        is_read_by_admin: currentUserType === 'admin',
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const result = await sendMessage(roomId, content, imageUrl, fileAttachment);
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
                    image_url: result.data!.image_url,
                    file_url: result.data!.file_url ?? m.file_url,
                    file_name: result.data!.file_name ?? m.file_name,
                    file_type: result.data!.file_type ?? m.file_type,
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
      {realtimeBanner && (
        <div className="shrink-0 px-3 py-2 text-center text-sm bg-amber-50 text-amber-900 border-b border-amber-100">
          {realtimeBanner}
        </div>
      )}
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
      <ChatInput roomId={roomId} onSend={handleSend} disabled={isSending} />
    </div>
  );
}
