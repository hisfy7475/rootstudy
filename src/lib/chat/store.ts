'use client';

// 채팅 SSOT(단일 진실원천) 모듈 external store.
// 메시지 스트림 / 관리자 룸목록 / 배지를 한 곳에 보관하고, useSyncExternalStore 로 구독한다.
// "실시간 이벤트는 보조신호, 진실은 서버 cursor backfill" — realtime/backfill 양쪽이
// 모두 upsertMessages 로 수렴하며, id dedup 으로 echo·optimistic·backfill 이 1 row 가 된다.

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { ChatMessageData, ChatRoomItem } from './types';

interface RoomState {
  messages: ChatMessageData[];
  hasMore: boolean;
  // 서버에서 확인된 max created_at (backfill 커서 기준).
  lastServerAt: string | null;
  // 아직 서버 echo 가 안 온 내 송신 id. created_at 이 클라 시각이라 커서에서 제외한다.
  optimisticIds: Set<string>;
}

interface ChatState {
  rooms: Map<string, RoomState>;
  roomList: ChatRoomItem[];
  badge: number;
}

const EMPTY_MESSAGES: ChatMessageData[] = [];

function emptyRoom(): RoomState {
  return { messages: EMPTY_MESSAGES, hasMore: false, lastServerAt: null, optimisticIds: new Set() };
}

let state: ChatState = { rooms: new Map(), roomList: [], badge: 0 };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function commit(next: ChatState) {
  state = next;
  emit();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getSnapshot() {
  return state;
}

function sortByCreatedAt(list: ChatMessageData[]) {
  return [...list].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
}

function withRoom(roomId: string, updater: (room: RoomState) => RoomState) {
  const prev = state.rooms.get(roomId) ?? emptyRoom();
  const nextRoom = updater(prev);
  if (nextRoom === prev) return;
  const rooms = new Map(state.rooms);
  rooms.set(roomId, nextRoom);
  commit({ ...state, rooms });
}

export const chatStore = {
  subscribe,
  getSnapshot,

  // SSR 초기 메시지로 룸을 시드한다.
  setInitialMessages(roomId: string, messages: ChatMessageData[], hasMore: boolean) {
    withRoom(roomId, (room) => {
      const sorted = sortByCreatedAt(messages);
      const lastServerAt = sorted.length ? sorted[sorted.length - 1].created_at : null;
      return { ...room, messages: sorted, hasMore, lastServerAt };
    });
  },

  // 상단 무한스크롤로 받은 과거 메시지 prepend.
  prependOlder(roomId: string, older: ChatMessageData[], hasMore: boolean) {
    withRoom(roomId, (room) => {
      const have = new Set(room.messages.map((m) => m.id));
      const additions = older.filter((m) => !have.has(m.id));
      if (additions.length === 0) return { ...room, hasMore };
      return { ...room, messages: sortByCreatedAt([...additions, ...room.messages]), hasMore };
    });
  },

  // 서버에서 온 메시지 머지(realtime echo / backfill 공용 진입점).
  // 같은 id 면 서버 버전으로 교체 → optimistic echo 가 서버 진실로 승격된다.
  upsertMessages(roomId: string, incoming: ChatMessageData[]) {
    if (incoming.length === 0) return;
    withRoom(roomId, (room) => {
      const byId = new Map(room.messages.map((m) => [m.id, m] as const));
      const optimisticIds = new Set(room.optimisticIds);
      let lastServerAt = room.lastServerAt;
      for (const m of incoming) {
        byId.set(m.id, m);
        optimisticIds.delete(m.id);
        if (lastServerAt === null || m.created_at > lastServerAt) lastServerAt = m.created_at;
      }
      return {
        ...room,
        messages: sortByCreatedAt([...byId.values()]),
        optimisticIds,
        lastServerAt,
      };
    });
  },

  // optimistic 송신 즉시 반영. echo 전까지 커서 계산에서 제외된다.
  addOptimistic(roomId: string, msg: ChatMessageData) {
    withRoom(roomId, (room) => {
      const optimisticIds = new Set(room.optimisticIds);
      optimisticIds.add(msg.id);
      return { ...room, messages: [...room.messages, msg], optimisticIds };
    });
  },

  // optimistic 롤백(전송 실패).
  removeMessage(roomId: string, messageId: string) {
    withRoom(roomId, (room) => {
      if (!room.messages.some((m) => m.id === messageId)) return room;
      const optimisticIds = new Set(room.optimisticIds);
      optimisticIds.delete(messageId);
      return { ...room, messages: room.messages.filter((m) => m.id !== messageId), optimisticIds };
    });
  },

  // soft delete 반영(본문/첨부 비우고 deleted_at 세팅).
  applyDeleted(roomId: string, messageId: string, deletedAt: string) {
    withRoom(roomId, (room) => {
      const idx = room.messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return room;
      if ((room.messages[idx].deleted_at ?? null) === deletedAt) return room;
      const messages = [...room.messages];
      messages[idx] = {
        ...messages[idx],
        content: '',
        image_url: null,
        file_url: null,
        file_name: null,
        file_type: null,
        deleted_at: deletedAt,
      };
      return { ...room, messages };
    });
  },

  getRoom(roomId: string): RoomState | undefined {
    return state.rooms.get(roomId);
  },

  getActiveRoomIds(): string[] {
    return [...state.rooms.keys()];
  },

  // backfill 커서 = optimistic 제외 max created_at.
  getBackfillCursor(roomId: string): string | null {
    const room = state.rooms.get(roomId);
    if (!room) return null;
    let max: string | null = null;
    for (const m of room.messages) {
      if (room.optimisticIds.has(m.id)) continue;
      if (max === null || m.created_at > max) max = m.created_at;
    }
    return max;
  },

  setRoomList(rooms: ChatRoomItem[]) {
    commit({ ...state, roomList: rooms });
  },

  // 관리자 좌측 목록: 새 메시지 도착 시 마지막 메시지/시각 갱신 + 상단 정렬.
  patchRoomFromMessage(roomId: string, lastMessage: string, at: string, incrementUnread: boolean) {
    const idx = state.roomList.findIndex((r) => r.id === roomId);
    if (idx < 0) return;
    const roomList = [...state.roomList];
    const cur = roomList[idx];
    roomList[idx] = {
      ...cur,
      last_message: lastMessage,
      last_message_at: at,
      unread_count: incrementUnread ? cur.unread_count + 1 : cur.unread_count,
    };
    roomList.sort((a, b) =>
      a.last_message_at < b.last_message_at ? 1 : a.last_message_at > b.last_message_at ? -1 : 0,
    );
    commit({ ...state, roomList });
  },

  setRoomUnread(roomId: string, unread: number) {
    const idx = state.roomList.findIndex((r) => r.id === roomId);
    if (idx < 0) return;
    const roomList = [...state.roomList];
    roomList[idx] = { ...roomList[idx], unread_count: unread };
    commit({ ...state, roomList });
  },

  setBadge(n: number) {
    if (state.badge === n) return;
    commit({ ...state, badge: n });
  },
};

// ---- selector 구독 훅 ----
// useSyncExternalStore 위에 selector + 동등성 비교를 얹어 필요한 슬라이스만 구독한다.
// selector 가 같은 값을 돌려주면 캐시된 참조를 반환해 불필요한 리렌더를 막는다.
export function useChatStore<T>(
  selector: (s: ChatState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const lastRef = useRef<{ value: T } | null>(null);
  const getSelection = useCallback(() => {
    const next = selector(getSnapshot());
    if (lastRef.current !== null && isEqual(lastRef.current.value, next)) {
      return lastRef.current.value;
    }
    lastRef.current = { value: next };
    return next;
  }, [selector, isEqual]);
  return useSyncExternalStore(subscribe, getSelection, getSelection);
}
