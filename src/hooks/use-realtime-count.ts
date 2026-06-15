'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * realtime 으로 갱신되는 "안 읽음 카운트" 단일 store.
 *
 * 설계 원칙:
 * - 서버 카운트(fetcher) = 진실(pull). realtime = "다시 당겨오라"는 힌트(push).
 * - realtime 이벤트는 payload 델타 계산을 하지 않고 debounce 후 refetch 만 한다.
 * - 폴백(pull) 상시: 구독 성공(SUBSCRIBED, 콜드스타트·재연결 커버) + 포그라운드 복귀(Provider 레벨)에서 refetch.
 * - mutation 측은 setCount 로 즉시 낙관 반영 후 refetch 로 정정.
 *
 * realtime 이 한 번 이벤트를 놓쳐도(모바일 소켓 끊김 등) pull 폴백으로 자가치유된다.
 */
export interface RealtimeCountSubscription {
  table: string;
  /** `column=eq.value` 형태. 없으면 테이블 전체 구독. */
  filter?: string;
}

export interface UseRealtimeCountOptions {
  userId: string | undefined;
  initial: number;
  /** 서버 권위 카운트 조회. 인자 없는 클로저로 래핑해 넘긴다. */
  fetcher: () => Promise<number>;
  subscriptions: RealtimeCountSubscription[];
  /** userId 를 포함한 유니크 채널명. */
  channelName: string;
  /** realtime 이벤트 디바운스(trailing). 대량 markAll 이벤트 합치기용. */
  debounceMs?: number;
}

export interface RealtimeCount {
  count: number;
  refetch: () => void;
  setCount: Dispatch<SetStateAction<number>>;
}

/** 재연결마다 SUBSCRIBED 가 반복 emit 될 때 refetch 폭주를 막는 쿨다운. */
const SUBSCRIBED_REFETCH_COOLDOWN_MS = 4000;

export function useRealtimeCount({
  userId,
  initial,
  fetcher,
  subscriptions,
  channelName,
  debounceMs = 300,
}: UseRealtimeCountOptions): RealtimeCount {
  // initial 은 mount 시드만. prop 변경을 effect 로 동기화하지 않는다(set-state-in-effect 회피).
  // 사용자 전환 시 카운트 리셋은 호출측 layout 의 Provider `key={userId}` 리마운트로 처리.
  const [count, setCount] = useState(initial);

  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefetchAtRef = useRef(0);
  const cancelledRef = useRef(false);
  // fetcher/subscriptions 가 매 렌더 새 참조여도 effect 재구독 없이 최신 값을 쓰도록 ref 보관.
  // (렌더 중 ref 변경은 금지 — commit 후 effect 에서 동기화. 첫 마운트는 useRef 초기값으로 이미 정확.)
  const fetcherRef = useRef(fetcher);
  const subscriptionsRef = useRef(subscriptions);
  useEffect(() => {
    fetcherRef.current = fetcher;
    subscriptionsRef.current = subscriptions;
  });

  // server action 은 abort 가 불가하므로 requestId 로 "마지막 요청만 채택"해 stale 응답 덮어쓰기를 막는다.
  const refetch = useCallback(() => {
    if (!userId) return;
    const id = ++requestIdRef.current;
    lastRefetchAtRef.current = Date.now();
    void fetcherRef
      .current()
      .then((next) => {
        if (cancelledRef.current) return;
        if (id !== requestIdRef.current) return; // 더 나중 요청이 떴으면 폐기
        setCount(next);
      })
      .catch((e) => {
        console.error(`[useRealtimeCount:${channelName}] refetch failed`, e);
      });
  }, [userId, channelName]);

  const debouncedRefetch = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      refetch();
    }, debounceMs);
  }, [refetch, debounceMs]);

  useEffect(() => {
    if (!userId) return;
    cancelledRef.current = false;
    const supabase = createClient();

    // 동기 채널 생성 — 수동 setAuth 제거(client.ts 의 realtime.accessToken 콜백이 인증 위임).
    // join 메시지는 토큰 확정 후 flush 되므로 첫 구독이 anon 으로 등록될 위험이 없다.
    let channel = supabase.channel(channelName);
    for (const sub of subscriptionsRef.current) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        () => debouncedRefetch(),
      );
    }
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return; // CHANNEL_ERROR/TIMED_OUT/CLOSED 는 곧 재구독되므로 무시
      // 콜드스타트(초기 구독) + 재연결 폴백. 플랩 시 쿨다운으로 폭주 방지.
      if (Date.now() - lastRefetchAtRef.current >= SUBSCRIBED_REFETCH_COOLDOWN_MS) {
        refetch();
      }
    });

    return () => {
      cancelledRef.current = true;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [userId, channelName, debouncedRefetch, refetch]);

  return { count, refetch, setCount };
}
