import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { Platform } from 'react-native';
import type { WebView } from 'react-native-webview';

import { buildInjectNativeMessageScript } from '../utils/bridge';

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

/** 앱 프로세스당 1회만 getLastNotificationResponseAsync 사용 (일반 실행 시 이전 탭 오탐 방지) */
let appColdStartNotificationChecked = false;

export type PushNotificationsApi = {
  sendPushTokenToWeb: () => void;
};

export function usePushNotifications(
  webViewRef: RefObject<WebView | null>,
  options: { webBaseUrl: string; setWebUri: (uri: string) => void }
): PushNotificationsApi {
  const tokenRef = useRef<string | null>(null);
  const platformRef = useRef<'ios' | 'android'>(Platform.OS === 'ios' ? 'ios' : 'android');

  const injectScript = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(script);
  }, [webViewRef]);

  const sendPushTokenToWeb = useCallback(() => {
    const token = tokenRef.current;
    if (!token) return;
    const script = buildInjectNativeMessageScript({
      type: 'PUSH_TOKEN',
      payload: { expo_push_token: token, platform: platformRef.current },
    });
    injectScript(script);
  }, [injectScript]);

  // 권한 + Expo 토큰
  useEffect(() => {
    ensureNotificationHandler();
    let cancelled = false;

    (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      if (!Device.isDevice) {
        return;
      }

      const { status: existing } = await Notifications.getPermissionsAsync();
      let final = existing;
      if (existing !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        final = req.status;
      }
      if (final !== 'granted' || cancelled) return;

      const extra = Constants.expoConfig?.extra as
        | { eas?: { projectId?: string } }
        | undefined;
      const projectId = extra?.eas?.projectId;

      if (!projectId) {
        console.warn('[push] EAS projectId missing in app config');
        return;
      }

      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled || !token) return;
        tokenRef.current = token;
      } catch (e) {
        console.warn('[push] getExpoPushTokenAsync failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const applyNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response?.notification?.request?.content?.data) return;
      const data = response.notification.request.content.data as { path?: unknown };
      const path = data.path;
      if (typeof path !== 'string' || !path.startsWith('/')) return;
      options.setWebUri(resolvePathToUri(options.webBaseUrl, path));
    },
    [options.webBaseUrl, options.setWebUri]
  );

  // 콜드 스타트: 앱 프로세스당 1회만 (일반 실행에서 이전 탭 오탐 방지)
  useEffect(() => {
    if (appColdStartNotificationChecked) return;
    appColdStartNotificationChecked = true;
    void Notifications.getLastNotificationResponseAsync().then(applyNotificationResponse);
  }, [applyNotificationResponse]);

  // 웜 스타트 / 포그라운드에서 알림 탭
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(applyNotificationResponse);
    return () => sub.remove();
  }, [applyNotificationResponse]);

  return { sendPushTokenToWeb };
}
