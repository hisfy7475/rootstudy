'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils';
import { onNativeMessage, postToNative, type NativeToWebMessage } from '@/lib/native-bridge';

/**
 * 네이티브 WebView 전용: Supabase 세션 ↔ SecureStore 동기화, SESSION_INJECT 처리.
 * 브라우저에서는 no-op.
 */
export function AuthBridge() {
  useEffect(() => {
    if (typeof window === 'undefined' || !isNativeApp()) {
      return;
    }

    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        postToNative({ type: 'LOGOUT', payload: {} });
        return;
      }

      if (
        (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
        session
      ) {
        postToNative({
          type: 'LOGIN_SUCCESS',
          payload: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          },
        });
      }
    });

    const unsubNative = onNativeMessage(async (msg: NativeToWebMessage) => {
      if (msg.type !== 'SESSION_INJECT') {
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: msg.payload.access_token,
        refresh_token: msg.payload.refresh_token,
      });

      if (error) {
        postToNative({ type: 'LOGOUT', payload: {} });
        return;
      }

      const next = msg.payload.returnPath?.trim();
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        window.location.href = next;
      } else {
        window.location.href = '/';
      }
    });

    return () => {
      subscription.unsubscribe();
      unsubNative();
    };
  }, []);

  return null;
}
