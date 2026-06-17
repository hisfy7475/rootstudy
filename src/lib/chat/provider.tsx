'use client';

// ChatProvider: 앱당 1회 마운트되어 단일 Realtime 채널을 store 에 연결한다.
// Context 는 자주 안 바뀌는 정적 메타(userId/scope/name)만 전달하고, 고빈도 메시지
// 스트림은 store selector 로 구독한다(Context value 변경 시 전 구독자 리렌더 회피).

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getStudentUnreadChatCount,
  getParentUnreadChatCount,
  getAdminUnreadChatCount,
} from '@/lib/actions/chat';
import { chatStore } from './store';
import { ensureChatRealtime } from './realtime';
import { runBackfill } from './backfill';
import type { ChatScope, ChatMessageData } from './types';

interface ChatMeta {
  currentUserId: string;
  scope: ChatScope;
  currentUserName: string;
}

const ChatContext = createContext<ChatMeta | null>(null);

export function useChatMeta(): ChatMeta {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatMeta must be used within ChatProvider');
  return ctx;
}

interface ChatProviderProps {
  currentUserId: string;
  scope: ChatScope;
  currentUserName?: string;
  initialBadge?: number;
  children: ReactNode;
}

type Row = Record<string, unknown>;

export function ChatProvider({
  currentUserId,
  scope,
  currentUserName = '나',
  initialBadge = 0,
  children,
}: ChatProviderProps) {
  const meta: ChatMeta = { currentUserId, scope, currentUserName };
  const metaRef = useRef(meta);
  // realtime 이벤트 클로저가 최신 메타를 읽도록 커밋 후 동기화(렌더 중 ref 쓰기 금지).
  useEffect(() => {
    metaRef.current = meta;
  });

  // SSR 초기 배지값 시드.
  useEffect(() => {
    chatStore.setBadge(initialBadge);
  }, [initialBadge]);

  useEffect(() => {
    const supabase = createClient();
    const profileCache = new Map<string, { name: string; user_type: string }>();

    // 배지는 서버 권위(RPC)로 유지하되, 메시지 폭주 시 호출을 합치기 위해 디바운스한다.
    // (특히 관리자 배지는 지점 내 전체 방 집계라 클라 store 로 정확히 파생할 수 없다.)
    let badgeTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshBadge = () => {
      if (badgeTimer) clearTimeout(badgeTimer);
      badgeTimer = setTimeout(() => {
        void (async () => {
          const { count } =
            scope === 'student'
              ? await getStudentUnreadChatCount()
              : scope === 'parent'
                ? await getParentUnreadChatCount()
                : await getAdminUnreadChatCount();
          chatStore.setBadge(count);
        })();
      }, 400);
    };

    const resolveProfile = async (senderId: string) => {
      const cached = profileCache.get(senderId);
      if (cached) return cached;
      const { data } = await supabase
        .from('profiles')
        .select('name, user_type')
        .eq('id', senderId)
        .single();
      const p = { name: data?.name || '알 수 없음', user_type: data?.user_type || 'unknown' };
      profileCache.set(senderId, p);
      return p;
    };

    const toMessage = (row: Row, prof: { name: string; user_type: string }): ChatMessageData => ({
      id: row.id as string,
      room_id: row.room_id as string,
      sender_id: row.sender_id as string,
      sender_name: prof.user_type === 'admin' ? '루트스터디센터' : prof.name,
      sender_type: prof.user_type,
      content: (row.content as string | null) ?? '',
      image_url: (row.image_url as string | null | undefined) ?? null,
      file_url: (row.file_url as string | null | undefined) ?? null,
      file_name: (row.file_name as string | null | undefined) ?? null,
      file_type: (row.file_type as string | null | undefined) ?? null,
      is_read_by_student: row.is_read_by_student as boolean,
      is_read_by_parent: row.is_read_by_parent as boolean,
      is_read_by_admin: row.is_read_by_admin as boolean,
      created_at: row.created_at as string,
      deleted_at: (row.deleted_at as string | null | undefined) ?? null,
    });

    const cleanup = ensureChatRealtime({
      roomFilter: null, // 전체 구독 + RLS 행 필터(scope별 자동 분리)
      onInsert: (row) => {
        const roomId = row.room_id as string;
        // 보고 있는(시드된) 방만 store 에 반영한다. 관리자처럼 지점 내 방이 많아도
        // 안 보는 방의 메시지를 무한 축적하지 않게 하고, 본문 store 는 열린 방만 다룬다.
        // (관리자 좌측 목록의 실시간 갱신은 admin chat-client 의 자체 채널이 담당.)
        if (chatStore.getRoom(roomId)) {
          const senderId = row.sender_id as string;
          void resolveProfile(senderId).then((prof) => {
            chatStore.upsertMessages(roomId, [toMessage(row, prof)]);
          });
        }
        refreshBadge();
      },
      onUpdate: (row) => {
        const deletedAt = (row.deleted_at as string | null | undefined) ?? null;
        if (deletedAt) chatStore.applyDeleted(row.room_id as string, row.id as string, deletedAt);
        refreshBadge();
      },
      onResubscribed: () => {
        for (const roomId of chatStore.getActiveRoomIds()) {
          void runBackfill(roomId, metaRef.current.currentUserId, refreshBadge);
        }
        refreshBadge();
      },
    });

    return () => {
      if (badgeTimer) clearTimeout(badgeTimer);
      cleanup();
    };
  }, [scope]);

  return <ChatContext.Provider value={meta}>{children}</ChatContext.Provider>;
}
