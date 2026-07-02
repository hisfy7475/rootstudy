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

    // SESSION_SYNC(네이티브발 토큰 반영)가 유발하는 SIGNED_IN 에코를 1회 억제하기 위한 플래그.
    // 그 에코를 네이티브로 되돌리면(LOGIN_SUCCESS), 좁은 로그아웃 레이스에서 네이티브 loggingOutRef가
    // 잘못 리셋돼 세션이 되살아날 수 있다. 네이티브가 이미 이 토큰의 출처이므로 되돌릴 필요도 없다.
    let suppressNextAuthPost = false;

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
        // SESSION_SYNC가 유발한 에코면 네이티브로 되돌리지 않고 1회 건너뛴다.
        if (suppressNextAuthPost) {
          suppressNextAuthPost = false;
          return;
        }
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
      // 네이티브가 업로드 중 회전시킨 토큰을 브라우저 세션에 반영한다(navigate 없음).
      // 이후 브라우저가 stale 한(이미 회전된) refresh 토큰을 재제출해 세션이 revoke 되는 것을 막는다.
      if (msg.type === 'SESSION_SYNC') {
        suppressNextAuthPost = true;
        const { error } = await supabase.auth.setSession({
          access_token: msg.payload.access_token,
          refresh_token: msg.payload.refresh_token,
        });
        // 실패 시 SIGNED_IN 이벤트가 발생하지 않으므로 억제 플래그를 되돌린다.
        if (error) suppressNextAuthPost = false;
        return;
      }

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
