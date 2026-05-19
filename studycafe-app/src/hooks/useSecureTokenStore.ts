import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

/** @see PROGRESS — SecureStore에 저장되는 세션 페이로드 */
const SESSION_KEY = 'studycafe_session_tokens';

export type StoredSession = {
  access_token: string;
  refresh_token: string;
};

export type SecureTokenStoreApi = {
  /** SecureStore 로드 완료 여부 (sessionRef와 동기화에 사용) */
  ready: boolean;
  /** 동기 접근용 최신 세션 (load 완료 후 갱신) */
  sessionRef: MutableRefObject<StoredSession | null>;
  saveSession: (accessToken: string, refreshToken: string) => Promise<void>;
  /**
   * 자동로그인 OFF 케이스용. SecureStore에는 저장하지 않고 메모리(sessionRef)만 갱신.
   * 앱 실행 중 채팅 업로드 등 토큰이 필요한 동작은 정상 동작하되, 앱 재실행 시
   * 자동 복원되지 않는다.
   */
  saveEphemeral: (accessToken: string, refreshToken: string) => void;
  clearSession: () => Promise<void>;
  getSession: () => Promise<StoredSession | null>;
};

export function useSecureTokenStore(): SecureTokenStoreApi {
  const sessionRef = useRef<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  const getSession = useCallback(async (): Promise<StoredSession | null> => {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (!raw) {
        sessionRef.current = null;
        return null;
      }
      const parsed = JSON.parse(raw) as StoredSession;
      if (
        typeof parsed?.access_token !== 'string' ||
        typeof parsed?.refresh_token !== 'string'
      ) {
        sessionRef.current = null;
        return null;
      }
      sessionRef.current = parsed;
      return parsed;
    } catch {
      sessionRef.current = null;
      return null;
    }
  }, []);

  useEffect(() => {
    void getSession().finally(() => setReady(true));
  }, [getSession]);

  const saveSession = useCallback(async (accessToken: string, refreshToken: string) => {
    const payload: StoredSession = { access_token: accessToken, refresh_token: refreshToken };
    sessionRef.current = payload;
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(payload));
  }, []);

  const saveEphemeral = useCallback((accessToken: string, refreshToken: string) => {
    // 자동로그인 OFF — SecureStore에는 쓰지 않고 메모리만 갱신.
    // 이전에 SecureStore에 남아 있을 수 있는 토큰을 비동기 정리하여,
    // 앱이 정상 종료(=process 죽음)되면 다음 부팅 때 자동 복원되지 않게 한다.
    sessionRef.current = { access_token: accessToken, refresh_token: refreshToken };
    void SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {
      /* 항목 없음 등 — 무시 */
    });
  }, []);

  const clearSession = useCallback(async () => {
    sessionRef.current = null;
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      /* 항목 없음 등 — 무시 */
    }
  }, []);

  return { ready, sessionRef, saveSession, saveEphemeral, clearSession, getSession };
}
