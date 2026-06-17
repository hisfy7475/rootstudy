'use client';

// 채팅 SSOT store 를 컴포넌트에서 쓰기 위한 selector 훅 + 액션.
// Phase 3 에서 chat-room / bottom-nav / sidebar / admin chat-client 가 이 훅들로 컷오버된다.

import { useCallback, useEffect, useRef } from 'react';
import {
  sendMessage,
  getOlderMessages,
  deleteMessage,
  markAsRead,
  type ChatFileAttachment,
} from '@/lib/actions/chat';
import { chatStore, useChatStore } from './store';
import { runBackfill } from './backfill';
import { useChatMeta } from './provider';
import type { ChatMessageData, ChatRoomItem } from './types';

const EMPTY_MESSAGES: ChatMessageData[] = [];

// 학생/학부모 하단탭 + 관리자 사이드바 배지(서버 권위 값을 store 가 보관).
export function useChatBadge(): number {
  return useChatStore((s) => s.badge);
}

// 관리자 좌측 채팅방 목록.
export function useChatRoomList(): ChatRoomItem[] {
  return useChatStore((s) => s.roomList);
}

interface UseChatRoomInit {
  messages: ChatMessageData[];
  hasMore: boolean;
}

// 단일 채팅방의 메시지 스트림 + 전송/이전로드/삭제 액션.
export function useChatRoom(roomId: string, init?: UseChatRoomInit) {
  const { currentUserId, currentUserName, scope } = useChatMeta();

  // SSR 초기 메시지 시드 + 진입 시 backfill/읽음 처리(roomId 변경마다 1회).
  useEffect(() => {
    if (init) chatStore.setInitialMessages(roomId, init.messages, init.hasMore);
    void runBackfill(roomId, currentUserId);
    void markAsRead(roomId);
    // init 은 SSR 1회성이라 deps 에서 의도적으로 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, currentUserId]);

  const messages = useChatStore(
    useCallback((s) => s.rooms.get(roomId)?.messages ?? EMPTY_MESSAGES, [roomId]),
  );
  const hasMore = useChatStore(useCallback((s) => s.rooms.get(roomId)?.hasMore ?? false, [roomId]));

  // 방을 보는 동안 타인의 새 메시지가 도착하면 읽음 처리.
  // realtime echo·backfill 양쪽 모두 store messages 로 수렴하므로 여기 한 곳만 보면 된다.
  const lastIncomingIdRef = useRef<string | null>(null);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.sender_id === currentUserId) return;
    if (lastIncomingIdRef.current === last.id) return;
    lastIncomingIdRef.current = last.id;
    void markAsRead(roomId);
  }, [messages, roomId, currentUserId]);

  const loadOlder = useCallback(async () => {
    const room = chatStore.getRoom(roomId);
    if (!room || !room.hasMore || room.messages.length === 0) return;
    const oldest = room.messages[0];
    const res = await getOlderMessages(roomId, oldest.created_at);
    if ('data' in res && res.data) {
      chatStore.prependOlder(roomId, res.data, res.hasMore ?? false);
    }
  }, [roomId]);

  // 첨부 업로드는 호출측(컴포넌트)에서 끝내고, 여기엔 결과 URL 만 넘긴다.
  const send = useCallback(
    async (
      content: string,
      imageUrl: string | null,
      fileAttachment: ChatFileAttachment | null,
      clientId: string,
    ) => {
      const optimistic: ChatMessageData = {
        id: clientId,
        room_id: roomId,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_type: scope,
        content,
        image_url: imageUrl,
        file_url: fileAttachment?.url ?? null,
        file_name: fileAttachment?.fileName ?? null,
        file_type: fileAttachment ? 'file' : null,
        is_read_by_student: scope === 'student',
        is_read_by_parent: scope === 'parent',
        is_read_by_admin: scope === 'admin',
        created_at: new Date().toISOString(),
        deleted_at: null,
      };
      chatStore.addOptimistic(roomId, optimistic);

      const res = await sendMessage(roomId, content, imageUrl, fileAttachment, clientId);
      if ('error' in res) {
        chatStore.removeMessage(roomId, clientId);
        throw new Error(res.error);
      }
    },
    [roomId, currentUserId, currentUserName, scope],
  );

  const remove = useCallback(
    async (messageId: string) => {
      const room = chatStore.getRoom(roomId);
      const target = room?.messages.find((m) => m.id === messageId);
      if (!target) return;
      const snapshot = { ...target };

      chatStore.applyDeleted(roomId, messageId, new Date().toISOString());
      const res = await deleteMessage(messageId);
      if ('error' in res) {
        chatStore.upsertMessages(roomId, [snapshot]); // 롤백
        throw new Error(res.error);
      }
    },
    [roomId],
  );

  return { messages, hasMore, loadOlder, send, remove };
}
