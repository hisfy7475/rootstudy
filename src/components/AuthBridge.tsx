'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils';
import { onNativeMessage, postToNative, type NativeToWebMessage } from '@/lib/native-bridge';
import { clearRememberCookie, readRememberCookie } from '@/lib/remember-me';

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

    // 현재 세션 토큰을 네이티브로 전달해 SecureStore를 최신 상태로 유지한다.
    // TOKEN_REFRESHED/복귀 시점마다 쿠키를 재독해 사용자의 자동로그인 선택을 일관 반영한다.
    const postLoginSuccess = (session: { access_token: string; refresh_token: string }) => {
      postToNative({
        type: 'LOGIN_SUCCESS',
        payload: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          remember: readRememberCookie(),
        },
      });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // 다음 로그인에서 기본값(ON) 재선택될 수 있도록 정리한다.
        clearRememberCookie();
        postToNative({ type: 'LOGOUT', payload: {} });
        return;
      }

      if (
        (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
        session
      ) {
        postLoginSuccess(session);
      }
    });

    // 앱이 백그라운드 → 포그라운드 복귀 시 현재 세션 토큰을 네이티브에 다시 전달한다.
    // 백그라운드 동안 자동 갱신 타이머가 멈춰 SecureStore 토큰이 묵을 수 있어, 복귀 시
    // getSession()(만료 임박 시 내부 자동 refresh)으로 신선한 토큰을 받아 재전달한다.
    // refreshSession() 강제 호출은 토큰 회전 충돌 위험이 있어 쓰지 않는다.
    const onForeground = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        // 로그아웃 직후 복귀 시 빈/죽은 토큰을 네이티브에 재저장하지 않도록 가드.
        if (!session) return;
        postLoginSuccess(session);
      });
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);

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
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
      unsubNative();
    };
  }, []);

  return null;
}
