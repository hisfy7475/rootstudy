'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessageList, ChatMessageData } from './chat-message-list';
import { ChatInput } from './chat-input';
import {
  sendMessage,
  markAsRead,
  getOlderMessages,
  deleteMessage,
  type ChatFileAttachment,
} from '@/lib/actions/chat';
import { createClient } from '@/lib/supabase/client';
import { uploadToBucketAsUser } from '@/lib/uploads/client';
import { resolveAttachmentFileMime, sanitizeAttachmentSegment } from '@shared/uploads/attachments';
import { isNativeApp, randomUUID } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

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
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // RLS `TO authenticated` 정책이 통과하려면 realtime.subscription 의 claims_role 이
    // 'authenticated' 여야 한다. 세션을 먼저 await + setAuth 한 뒤 subscribe 한다.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase
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

            const senderName = cached.user_type === 'admin' ? '루트스터디센터' : cached.name;

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
              deleted_at: payload.new.deleted_at ?? null,
            };

            // optimistic 메시지의 id 가 곧 서버 row 의 id (clientId 가 PK).
            // 따라서 같은 id 가 이미 state 에 있으면 echo 이며 무시하면 된다 —
            // tempId→realId 스왑이나 content 매칭 휴리스틱이 필요 없다.
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });

            if (senderId !== currentUserId) {
              markAsRead(roomId);
            }
          },
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
            const next = payload.new as {
              id: string;
              deleted_at: string | null;
            };
            // markAsRead 로 인한 잦은 UPDATE 이벤트는 무시하고
            // deleted_at 변경만 반영해 메시지 본문/첨부를 비운다.
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === next.id);
              if (idx < 0) return prev;
              const cur = prev[idx];
              if ((cur.deleted_at ?? null) === (next.deleted_at ?? null)) return prev;
              const updated = [...prev];
              updated[idx] = {
                ...cur,
                content: '',
                image_url: null,
                file_url: null,
                file_name: null,
                file_type: null,
                deleted_at: next.deleted_at ?? null,
              };
              return updated;
            });
          },
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
    })();

    return () => {
      cancelled = true;
      if (realtimeRetryTimerRef.current) {
        clearTimeout(realtimeRetryTimerRef.current);
        realtimeRetryTimerRef.current = null;
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, currentUserId, realtimeChannelGen]);

  // 네이티브: Storage 업로드 후 FILE_UPLOADED → 이미지 또는 파일 메시지 전송
  useEffect(() => {
    if (typeof window === 'undefined' || !isNativeApp()) return;

    const sendAfterNativeUpload = async (
      imageUrl: string | null,
      attachment: ChatFileAttachment | null,
    ) => {
      setIsSending(true);
      const clientId = randomUUID();
      const optimisticMessage: ChatMessageData = {
        id: clientId,
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
        deleted_at: null,
      };
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const result = await sendMessage(roomId, '', imageUrl, attachment, clientId);
        if (result.error) {
          setMessages((prev) => prev.filter((m) => m.id !== clientId));
          alert(result.error);
        }
        // 성공 시 별도 처리 불필요: optimistic 의 id 가 곧 서버 row 의 id 이므로
        // realtime echo 도, sendMessage 응답도 같은 row 를 가리킨다.
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== clientId));
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
          payload?: {
            url?: string;
            filename?: string;
            mime_type?: string;
            message?: string;
            context?: string;
          };
        };
        // context echo 가 없거나 'chat' 인 메시지만 채팅이 처리.
        // (구버전 네이티브 앱은 context 미포함이라 폴백 허용; 신버전에서는 반드시 'chat' 만)
        const ctx = parsed.payload?.context;
        if (ctx != null && ctx !== 'chat') return;
        if (parsed.type === 'FILE_UPLOAD_ERROR') {
          setIsSending(false);
          alert(parsed.payload?.message ?? '파일 업로드에 실패했습니다.');
          return;
        }
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

  // 메시지 전송. clientId 는 ChatInput 에서 발송 단위로 생성한 uuid 이며
  // optimistic 메시지의 id 와 서버 row 의 id 양쪽으로 그대로 사용된다.
  const handleSend = useCallback(
    async (content: string, imageFile: File | null, dataFile: File | null, clientId: string) => {
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

        // 브라우저에서 Supabase Storage로 직접 업로드(서버 액션 우회 → 4.5MB 한계 없음).
        // 경로 prefix(`${user.id}/`)는 헬퍼가 강제한다.
        const ext = imageFile.name.split('.').pop() || 'jpg';
        const uploadResult = await uploadToBucketAsUser({
          bucket: 'chat-images',
          pathWithinUser: `${roomId}/${Date.now()}.${ext}`,
          file: imageFile,
          contentType: imageFile.type || 'image/jpeg',
        });
        if (!uploadResult.ok) {
          console.error('Image upload error:', uploadResult.error);
          alert(uploadResult.error);
          setIsSending(false);
          if (tempImagePreview) URL.revokeObjectURL(tempImagePreview);
          return;
        }
        imageUrl = uploadResult.url;
      }

      if (dataFile) {
        // 확장자 우선으로 MIME 결정(빈 file.type 보정). 서버 액션이 하던 로직을 그대로 미러.
        const resolvedMime = resolveAttachmentFileMime(dataFile.type, dataFile.name);
        if (!resolvedMime) {
          alert('지원하지 않는 파일 형식입니다. (PDF, Office 문서, TXT, CSV, ZIP 등)');
          setIsSending(false);
          if (tempImagePreview) URL.revokeObjectURL(tempImagePreview);
          return;
        }
        const safeBase = sanitizeAttachmentSegment(dataFile.name);
        const uploadResult = await uploadToBucketAsUser({
          bucket: 'chat-files',
          pathWithinUser: `${roomId}/${Date.now()}_${safeBase}`,
          file: dataFile,
          contentType: resolvedMime,
          downloadFileName: dataFile.name, // 다운로드 시 원본(한글) 파일명 보존
        });
        if (!uploadResult.ok) {
          console.error('File upload error:', uploadResult.error);
          alert(uploadResult.error);
          setIsSending(false);
          if (tempImagePreview) URL.revokeObjectURL(tempImagePreview);
          return;
        }
        fileAttachment = {
          url: uploadResult.url,
          fileName: dataFile.name,
          mimeType: resolvedMime,
        };
      }

      const optimisticMessage: ChatMessageData = {
        id: clientId,
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
        deleted_at: null,
      };

      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const result = await sendMessage(roomId, content, imageUrl, fileAttachment, clientId);
        if (result.error) {
          setMessages((prev) => prev.filter((m) => m.id !== clientId));
          console.error('Send message error:', result.error);
          alert(result.error);
        }
        // 성공 시 추가 처리 불필요 — optimistic id == 서버 id.
      } catch (error) {
        setMessages((prev) => prev.filter((m) => m.id !== clientId));
        console.error('Send message error:', error);
        alert('메시지 전송에 실패했습니다.');
      } finally {
        setIsSending(false);
        if (tempImagePreview) URL.revokeObjectURL(tempImagePreview);
      }
    },
    [roomId, currentUserId, currentUserName, currentUserType],
  );

  // 메시지 삭제 (본인 5분 이내). optimistic 으로 즉시 deleted_at 세팅 후
  // 서버 실패 시 롤백. 성공 시 Realtime UPDATE 가 멱등 보강.
  const handleDelete = useCallback(
    async (messageId: string) => {
      const target = messages.find((m) => m.id === messageId);
      if (!target) return;
      const snapshot = { ...target };

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: '',
                image_url: null,
                file_url: null,
                file_name: null,
                file_type: null,
                deleted_at: new Date().toISOString(),
              }
            : m,
        ),
      );

      const result = await deleteMessage(messageId);
      if (result.error) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? snapshot : m)));
        toast.error(result.error);
      }
    },
    [messages],
  );

  return (
    <div className='flex h-full flex-col bg-white'>
      {realtimeBanner && (
        <div className='shrink-0 border-b border-amber-100 bg-amber-50 px-3 py-2 text-center text-sm text-amber-900'>
          {realtimeBanner}
        </div>
      )}
      {/* 헤더 */}
      <div className='flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3'>
        {showBackButton && onBack && (
          <button
            onClick={onBack}
            className='-ml-2 rounded-full p-2 transition-colors hover:bg-gray-100'
          >
            <ArrowLeft className='text-text h-5 w-5' />
          </button>
        )}
        <div className='min-w-0 flex-1'>
          <h2 className='text-text truncate font-semibold'>{title}</h2>
          {subtitle && <p className='text-text-muted truncate text-sm'>{subtitle}</p>}
        </div>
      </div>

      {/* 메시지 목록 */}
      <ChatMessageList
        messages={messages}
        currentUserId={currentUserId}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
        onDelete={handleDelete}
      />

      {/* 입력창 */}
      <ChatInput roomId={roomId} onSend={handleSend} disabled={isSending} />
    </div>
  );
}
