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

  const clearSession = useCallback(async () => {
    sessionRef.current = null;
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      /* 항목 없음 등 — 무시 */
    }
  }, []);

  return { ready, sessionRef, saveSession, clearSession, getSession };
}
