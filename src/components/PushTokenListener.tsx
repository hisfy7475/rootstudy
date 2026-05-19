'use client';

import { useEffect, useRef } from 'react';

import { setStoredExpoPushToken } from '@/lib/expo-push-token-storage';
import { isNativeApp } from '@/lib/utils';

type PushTokenPayload = {
  type: string;
  payload?: { expo_push_token?: string; platform?: string };
};

export function PushTokenListener() {
  const lastRegistered = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !isNativeApp()) {
      return;
    }

    const register = (token: string, platform: 'ios' | 'android') => {
      if (lastRegistered.current === token) {
        return;
      }
      lastRegistered.current = token;
      setStoredExpoPushToken(token);

      void fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          expo_push_token: token,
          platform,
        }),
      }).catch((e) => console.error('[PushTokenListener]', e));
    };

    const handler = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : null;
      if (!raw) return;

      let parsed: PushTokenPayload;
      try {
        parsed = JSON.parse(raw) as PushTokenPayload;
      } catch {
        return;
      }

      if (parsed.type !== 'PUSH_TOKEN') return;

      const token = parsed.payload?.expo_push_token;
      const platform = parsed.payload?.platform;
      if (!token || (platform !== 'ios' && platform !== 'android')) {
        return;
      }

      register(token, platform);
    };

    window.addEventListener('message', handler);

    // 마운트 시점에 네이티브에 현재 토큰 재전송을 요청한다.
    // (로그인 페이지에서 이미 토큰이 dispatch된 뒤 student/parent 영역으로 진입한 경우 복구)
    const rn = (window as unknown as {
      ReactNativeWebView?: { postMessage: (s: string) => void };
    }).ReactNativeWebView;
    rn?.postMessage(JSON.stringify({ type: 'REQUEST_PUSH_TOKEN', payload: {} }));

    return () => window.removeEventListener('message', handler);
  }, []);

  return null;
}
