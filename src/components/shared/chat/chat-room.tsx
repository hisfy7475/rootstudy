'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChatMessageList, ChatMessageData } from './chat-message-list';
import { ChatInput } from './chat-input';
import { type ChatFileAttachment } from '@/lib/actions/chat';
import { useChatRoom } from '@/lib/chat/hooks';
import { uploadToBucketAsUser } from '@/lib/uploads/client';
import { resolveAttachmentFileMime, sanitizeAttachmentSegment } from '@shared/uploads/attachments';
import { isNativeApp, randomUUID } from '@/lib/utils';
import { isSessionExpiredUploadMessage } from '@/lib/native-bridge';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface ChatRoomProps {
  roomId: string;
  initialMessages: ChatMessageData[];
  initialHasMore?: boolean;
  currentUserId: string;
  currentUserType: 'student' | 'parent' | 'admin';
  // 발신자 이름은 ChatProvider 컨텍스트에서 가져온다. 호출부 하위호환을 위해 prop 은 남겨둔다.
  currentUserName?: string;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  showBackButton?: boolean;
}

// 본문/전송/이전로드/삭제·realtime·backfill 은 useChatRoom(SSOT) 이 담당한다.
// 이 컴포넌트는 첨부 업로드, 네이티브 브리지, 레이아웃만 책임진다.
export function ChatRoom({
  roomId,
  initialMessages,
  initialHasMore = false,
  currentUserId,
  currentUserType,
  title = '채팅',
  subtitle,
  onBack,
  showBackButton = false,
}: ChatRoomProps) {
  const { messages, hasMore, loadOlder, send, remove } = useChatRoom(roomId, {
    messages: initialMessages,
    hasMore: initialHasMore,
  });

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // 이전 메시지 로드 (상단 무한스크롤)
  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      await loadOlder();
    } catch {
      console.error('Failed to load older messages');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, messages.length, loadOlder]);

  // 메시지 전송. 첨부는 여기서 Storage 직접 업로드한 뒤 결과 URL 만 send 로 넘긴다.
  // (optimistic / 서버 기록 / echo 멱등 흡수는 useChatRoom.send 가 처리.)
  const handleSend = useCallback(
    async (content: string, imageFile: File | null, dataFile: File | null, clientId: string) => {
      if (imageFile && dataFile) {
        alert('이미지와 파일을 동시에 보낼 수 없습니다.');
        return;
      }

      setIsSending(true);
      try {
        let imageUrl: string | null = null;
        let fileAttachment: ChatFileAttachment | null = null;

        if (imageFile) {
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
            // 세션 만료(code:'auth')는 전역 SessionExpiredDialog가 재로그인을 유도하므로
            // 중복 alert를 띄우지 않는다.
            if (uploadResult.code !== 'auth') alert(uploadResult.error);
            return;
          }
          imageUrl = uploadResult.url;
        }

        if (dataFile) {
          // 확장자 우선으로 MIME 결정(빈 file.type 보정). 서버 액션이 하던 로직을 그대로 미러.
          const resolvedMime = resolveAttachmentFileMime(dataFile.type, dataFile.name);
          if (!resolvedMime) {
            alert('지원하지 않는 파일 형식입니다. (PDF, Office 문서, TXT, CSV, ZIP 등)');
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
            // 세션 만료(code:'auth')는 전역 SessionExpiredDialog가 재로그인을 유도하므로
            // 중복 alert를 띄우지 않는다.
            if (uploadResult.code !== 'auth') alert(uploadResult.error);
            return;
          }
          fileAttachment = {
            url: uploadResult.url,
            fileName: dataFile.name,
            mimeType: resolvedMime,
          };
        }

        await send(content, imageUrl, fileAttachment, clientId);
      } catch (error) {
        console.error('Send message error:', error);
        alert(error instanceof Error ? error.message : '메시지 전송에 실패했습니다.');
      } finally {
        setIsSending(false);
      }
    },
    [roomId, send],
  );

  // 메시지 삭제 (본인 5분 이내). useChatRoom.remove 가 optimistic + 실패 롤백을 처리.
  const handleDelete = useCallback(
    async (messageId: string) => {
      try {
        await remove(messageId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '메시지를 삭제하지 못했습니다.');
      }
    },
    [remove],
  );

  // 네이티브: Storage 업로드 후 FILE_UPLOADED → 이미지/파일 메시지 전송.
  useEffect(() => {
    if (typeof window === 'undefined' || !isNativeApp()) return;

    const sendAfterNativeUpload = async (
      imageUrl: string | null,
      attachment: ChatFileAttachment | null,
    ) => {
      setIsSending(true);
      try {
        await send('', imageUrl, attachment, randomUUID());
      } catch (error) {
        alert(error instanceof Error ? error.message : '메시지 전송에 실패했습니다.');
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
            roomId?: string;
          };
        };
        // context echo 가 없거나 'chat' 인 메시지만 채팅이 처리.
        // (구버전 네이티브 앱은 context 미포함이라 폴백 허용; 신버전에서는 반드시 'chat' 만)
        const ctx = parsed.payload?.context;
        if (ctx != null && ctx !== 'chat') return;
        // roomId echo 가 있으면 현재 방과 일치할 때만 처리(멀티룸 오라우팅 방지).
        // 없으면 구버전 앱 하위호환으로 폴백 허용.
        const echoedRoomId = parsed.payload?.roomId;
        if (echoedRoomId != null && echoedRoomId !== roomId) return;
        if (parsed.type === 'FILE_UPLOAD_ERROR') {
          setIsSending(false);
          // 세션 만료(구버전 네이티브)는 막다른 alert 대신 전역 재로그인 다이얼로그로 유도.
          if (isSessionExpiredUploadMessage(parsed.payload?.message)) {
            window.dispatchEvent(new CustomEvent('rootstudy:session-expired'));
            return;
          }
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
  }, [roomId, send]);

  return (
    <div className='flex h-full flex-col bg-white'>
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
      <ChatInput
        roomId={roomId}
        onSend={handleSend}
        disabled={isSending}
        currentUserType={currentUserType}
      />
    </div>
  );
}
