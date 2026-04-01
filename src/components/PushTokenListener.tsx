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
    return () => window.removeEventListener('message', handler);
  }, []);

  return null;
}
