'use client';

// 재연결/포그라운드 복귀 시 "내가 가진 마지막 서버 메시지 이후"를 재조회해 store 에 머지한다.
// postgres_changes 는 구독이 끊긴 동안의 INSERT 를 전달하지 않으므로 이 backfill 이 공백을 메운다.

import { getNewerMessages } from '@/lib/actions/chat';
import { chatStore } from './store';

const MAX_ITERATIONS = 10;
const inFlight = new Set<string>();

export async function runBackfill(
  roomId: string,
  currentUserId: string,
  onOthersMessage?: () => void,
): Promise<void> {
  if (inFlight.has(roomId)) return;

  const maxServerAt = chatStore.getBackfillCursor(roomId);
  if (!maxServerAt) return; // 빈 방/전부 optimistic → 초기 로드가 진실

  inFlight.add(roomId);
  try {
    // 첫 호출만 1ms 겹쳐 받아 경계 메시지 누락 방지(중복은 id dedup 으로 흡수).
    let cursor = new Date(new Date(maxServerAt).getTime() - 1).toISOString();
    let sawOthers = false;

    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      const res = await getNewerMessages(roomId, cursor);
      if ('error' in res || !res.data || res.data.length === 0) break;
      const batch = res.data;
      chatStore.upsertMessages(roomId, batch);
      if (batch.some((m) => m.sender_id !== currentUserId)) sawOthers = true;
      cursor = batch[batch.length - 1].created_at; // 이후 루프는 strict .gt 로 전진
      if (!res.hasMore) break;
    }

    if (sawOthers) onOthersMessage?.();
  } finally {
    inFlight.delete(roomId);
  }
}
