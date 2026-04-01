/** 네이티브 앱에서 회원 로그아웃 시 `/api/push/unregister`에 넘길 Expo 토큰 (sessionStorage) */
export const EXPO_PUSH_TOKEN_SESSION_KEY = 'studycafe_expo_push_token';

export function getStoredExpoPushToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(EXPO_PUSH_TOKEN_SESSION_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setStoredExpoPushToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(EXPO_PUSH_TOKEN_SESSION_KEY, token);
  } catch {
    /* private mode 등 */
  }
}

export function clearStoredExpoPushToken(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(EXPO_PUSH_TOKEN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
