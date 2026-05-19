import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { AppState, Platform } from 'react-native';
import type { WebView } from 'react-native-webview';

import { buildInjectNativeMessageScript } from '../utils/bridge';

const TOKEN_FETCH_RETRY_DELAYS_MS = [2000, 4000];

let notificationHandlerConfigured = false;

function ensureNotificationHandler() {
  if (notificationHandlerConfigured) return;
  notificationHandlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function resolvePathToUri(webBaseUrl: string, path: string): string {
  const base = webBaseUrl.replace(/\/$/, '');
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 앱 프로세스당 1회만 getLastNotificationResponseAsync 사용 (일반 실행 시 이전 탭 오탐 방지) */
let appColdStartNotificationChecked = false;

export type PushNotificationsApi = {
  sendPushTokenToWeb: () => void;
};

export function usePushNotifications(
  webViewRef: RefObject<WebView | null>,
  { webBaseUrl, setWebUri }: { webBaseUrl: string; setWebUri: (uri: string) => void }
): PushNotificationsApi {
  const tokenRef = useRef<string | null>(null);
  const webViewLoadedRef = useRef(false);
  const tokenFetchInFlightRef = useRef(false);
  const platformRef = useRef<'ios' | 'android'>(Platform.OS === 'ios' ? 'ios' : 'android');

  const injectScript = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(script);
  }, [webViewRef]);

  const flushIfReady = useCallback(() => {
    if (!webViewLoadedRef.current) return;
    const token = tokenRef.current;
    if (!token) return;
    const script = buildInjectNativeMessageScript({
      type: 'PUSH_TOKEN',
      payload: { expo_push_token: token, platform: platformRef.current },
    });
    injectScript(script);
  }, [injectScript]);

  // WebView onLoadEnd 호출 = "WebView 로드 완료" 신호 + 토큰 준비됐으면 즉시 inject.
  const sendPushTokenToWeb = useCallback(() => {
    webViewLoadedRef.current = true;
    flushIfReady();
  }, [flushIfReady]);

  const fetchAndStoreToken = useCallback(async () => {
    if (tokenFetchInFlightRef.current) return;
    if (tokenRef.current) {
      flushIfReady();
      return;
    }
    tokenFetchInFlightRef.current = true;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      if (!Device.isDevice) return;

      const { status: existing } = await Notifications.getPermissionsAsync();
      let final = existing;
      if (existing !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        final = req.status;
      }
      if (final !== 'granted') return;

      const extra = Constants.expoConfig?.extra as
        | { eas?: { projectId?: string } }
        | undefined;
      const projectId = extra?.eas?.projectId;

      if (!projectId) {
        console.warn('[push] EAS projectId missing in app config');
        return;
      }

      // FCM 첫 등록은 수 초 걸리므로 재시도 (movielab 패턴과 동일: 2s/4s backoff, 최대 3회)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
          if (token) {
            tokenRef.current = token;
            flushIfReady();
          }
          return;
        } catch (e) {
          if (attempt >= 2) {
            console.warn('[push] getExpoPushTokenAsync failed after retries', e);
            return;
          }
          await delay(TOKEN_FETCH_RETRY_DELAYS_MS[attempt]);
        }
      }
    } finally {
      tokenFetchInFlightRef.current = false;
    }
  }, [flushIfReady]);

  // 권한 + Expo 토큰 (초기 1회)
  useEffect(() => {
    ensureNotificationHandler();
    void fetchAndStoreToken();
  }, [fetchAndStoreToken]);

  // 포그라운드 복귀 시 — 토큰 없으면 재시도, 있으면 미전송분 flush.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!tokenRef.current) {
        void fetchAndStoreToken();
      } else {
        flushIfReady();
      }
    });
    return () => sub.remove();
  }, [fetchAndStoreToken, flushIfReady]);

  const applyNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response?.notification?.request?.content?.data) return;
      const data = response.notification.request.content.data as { path?: unknown };
      const path = data.path;
      if (typeof path !== 'string' || !path.startsWith('/')) return;
      setWebUri(resolvePathToUri(webBaseUrl, path));
    },
    [webBaseUrl, setWebUri]
  );

  // 콜드 스타트: 앱 프로세스당 1회만 (일반 실행에서 이전 탭 오탐 방지)
  useEffect(() => {
    if (appColdStartNotificationChecked) return;
    appColdStartNotificationChecked = true;
    applyNotificationResponse(Notifications.getLastNotificationResponse());
  }, [applyNotificationResponse]);

  // 웜 스타트 / 포그라운드에서 알림 탭
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(applyNotificationResponse);
    return () => sub.remove();
  }, [applyNotificationResponse]);

  return { sendPushTokenToWeb };
}
