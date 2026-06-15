'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useRealtimeCount, type RealtimeCount } from '@/hooks/use-realtime-count';
import {
  getUnreadNotificationCount,
  getUnreadUserNotificationCount,
} from '@/lib/actions/notification';

/**
 * 안 읽음 배지 카운트의 단일 공유 store.
 *
 * 역할 layout 에 Provider 1개를 마운트하고 SSR 초기값으로 시드한다. 헤더·알림 페이지가
 * 각자 useState 로 복제하던 카운트를 이 store 하나로 통일해, "모두 읽음" 시 헤더 배지가
 * realtime 과 무관하게 즉시 반영된다.
 *
 * 이번 슬라이스는 알림(notification) 카운트만 노출한다. 공지/채팅/지점알림은 후속 확장 시
 * 동일 패턴으로 필드를 추가한다.
 */
interface UnreadCounts {
  notif: RealtimeCount;
}

const NOOP_COUNT: RealtimeCount = {
  count: 0,
  refetch: () => {},
  setCount: () => {},
};

// Provider 가 트리에 없을 때만 쓰이는 기본값. 헤더·알림 페이지는 항상 역할 layout 하위라
// 실제로는 쓰이지 않는다(반드시 children 까지 Provider 로 감쌀 것).
const UnreadCountsContext = createContext<UnreadCounts>({ notif: NOOP_COUNT });

export function useUnreadCounts(): UnreadCounts {
  return useContext(UnreadCountsContext);
}

/**
 * 포그라운드 복귀 시 refetch — Provider 레벨 단일 리스너(hook 마다 등록 금지).
 * 모바일 WebView 가 백그라운드 동안 놓친 변경을 복귀 시 pull 로 자가치유.
 */
function useForegroundRefetch(refetch: () => void) {
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refetchRef.current(), 300);
    };
    document.addEventListener('visibilitychange', trigger);
    window.addEventListener('focus', trigger);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', trigger);
      window.removeEventListener('focus', trigger);
    };
  }, []);
}

export function StudentCountsProvider({
  userId,
  initialNotif,
  children,
}: {
  userId: string | undefined;
  initialNotif: number;
  children: ReactNode;
}) {
  const notif = useRealtimeCount({
    userId,
    initial: initialNotif,
    fetcher: () => getUnreadNotificationCount({ excludeTypes: ['chat'] }),
    subscriptions: [
      { table: 'student_notifications', filter: userId ? `student_id=eq.${userId}` : undefined },
    ],
    channelName: `counts-student-notif-${userId ?? 'anon'}`,
  });
  useForegroundRefetch(notif.refetch);

  return <UnreadCountsContext.Provider value={{ notif }}>{children}</UnreadCountsContext.Provider>;
}

export function ParentCountsProvider({
  userId,
  initialNotif,
  children,
}: {
  userId: string | undefined;
  initialNotif: number;
  children: ReactNode;
}) {
  const notif = useRealtimeCount({
    userId,
    initial: initialNotif,
    fetcher: () => getUnreadUserNotificationCount({ excludeTypes: ['chat'] }),
    subscriptions: [
      { table: 'user_notifications', filter: userId ? `user_id=eq.${userId}` : undefined },
    ],
    channelName: `counts-parent-notif-${userId ?? 'anon'}`,
  });
  useForegroundRefetch(notif.refetch);

  return <UnreadCountsContext.Provider value={{ notif }}>{children}</UnreadCountsContext.Provider>;
}
