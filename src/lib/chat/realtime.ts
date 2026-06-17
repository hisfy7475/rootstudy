'use client';

// 앱당 1개의 chat_messages Realtime 채널을 관리한다.
// 기존엔 본문/배지/관리자목록이 각자 채널을 열어 같은 테이블을 2~3중 구독했는데,
// 이 모듈로 단일 채널 + 단일 구독자(Provider)로 통합한다.
//
// 핵심: RLS `TO authenticated` 통과를 위해 getSession→setAuth→subscribe 순서를 지킨다.
// (anon claim_role 로 먼저 등록되면 postgres_changes 이벤트가 영영 도달하지 않는다.)

import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

interface ChatRealtimeHandlers {
  // 학생/학부모는 단일/소수 룸이라 RLS 가 자동 필터하므로 보통 null(전체) 로 둔다.
  // 특정 룸만 받고 싶으면 `room_id=eq.<roomId>` 를 넘긴다.
  roomFilter?: string | null;
  onInsert: (row: Row) => void;
  onUpdate: (row: Row) => void;
  // 최초 포함 매 SUBSCRIBED 마다 호출(재구독 시 backfill 트리거용).
  onResubscribed: () => void;
}

const MAX_RETRY = 5;

export function ensureChatRealtime(handlers: ChatRealtimeHandlers): () => void {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  let gen = 0;
  let retry = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const attach = () => {
    if (cancelled) return;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      const ch = supabase.channel(`chat:ssot:${gen}`);
      if (handlers.roomFilter) {
        ch.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: handlers.roomFilter,
          },
          (p) => handlers.onInsert(p.new as Row),
        ).on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_messages',
            filter: handlers.roomFilter,
          },
          (p) => handlers.onUpdate(p.new as Row),
        );
      } else {
        ch.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (p) => handlers.onInsert(p.new as Row),
        ).on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
          (p) => handlers.onUpdate(p.new as Row),
        );
      }

      channel = ch.subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          retry = 0;
          handlers.onResubscribed();
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (retryTimer) clearTimeout(retryTimer);
          if (retry < MAX_RETRY) {
            const delay = 1000 * 2 ** retry;
            retry += 1;
            retryTimer = setTimeout(reconnect, delay);
          }
        }
      });
    })();
  };

  const reconnect = () => {
    if (cancelled) return;
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    gen += 1;
    attach();
  };

  attach();

  // 포그라운드 복귀 / 네트워크 복구 시 강제 재구독 → SUBSCRIBED → backfill.
  // 3회 백오프 소진으로 멈춘 상태도 여기서 retry 리셋으로 되살린다.
  const wake = () => {
    if (document.visibilityState !== 'visible') return;
    retry = 0;
    reconnect();
  };
  const onOnline = () => {
    retry = 0;
    reconnect();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', onOnline);

  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', onOnline);
    if (channel) supabase.removeChannel(channel);
  };
}
