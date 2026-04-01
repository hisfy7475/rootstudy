'use client';

import { signOut } from '@/app/(auth)/actions';
import {
  clearStoredExpoPushToken,
  getStoredExpoPushToken,
} from '@/lib/expo-push-token-storage';
import { postToNative } from '@/lib/native-bridge';
import { isNativeApp } from '@/lib/utils';

async function unregisterPushTokenIfAny(): Promise<void> {
  const token = getStoredExpoPushToken();
  if (!token) return;
  try {
    await fetch('/api/push/unregister', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expo_push_token: token }),
    });
  } catch {
    /* 오프라인 등 — 로그아웃은 계속 */
  } finally {
    clearStoredExpoPushToken();
  }
}

/** 네이티브 앱이면 SecureStore 삭제를 위해 LOGOUT 브리지 후 서버 signOut(리다이렉트) */
export async function signOutWithNativeSync(): Promise<void> {
  await unregisterPushTokenIfAny();
  if (isNativeApp()) {
    postToNative({ type: 'LOGOUT', payload: {} });
  }
  await signOut();
}
