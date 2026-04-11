import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { WEB_BASE_URL, APP_USER_AGENT_SUFFIX } from './constants';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useSecureTokenStore } from './hooks/useSecureTokenStore';
import {
  uploadChatFileFromNative,
  uploadChatImageFromNative,
} from './lib/nativeChatUpload';
import {
  buildInjectNativeMessageScript,
  parseWebMessage,
  WebToNativeMessage,
} from './utils/bridge';
import { resolveDeepLinkToWebUri } from './utils/deepLink';
import { shouldOpenExternalAppForUrl } from './utils/schemes';

function urlLooksLikeLoginPage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === '/login' || u.pathname.endsWith('/login');
  } catch {
    return url.includes('/login');
  }
}

function isTruthyPath(pathname: string): boolean {
  return pathname !== '/' && pathname !== '';
}

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webUri, setWebUri] = useState(WEB_BASE_URL);
  const [retryNonce, setRetryNonce] = useState(0);
  const splashHiddenRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const lastUrlRef = useRef<string>(WEB_BASE_URL);
  const sessionInjectAttemptedRef = useRef(false);
  const deepLinkReturnPathRef = useRef<string | null>(null);

  const { ready: secureReady, sessionRef, saveSession, clearSession } = useSecureTokenStore();

  const setWebUriStable = useCallback((uri: string) => {
    setWebUri((prev) => (prev === uri ? prev : uri));
  }, []);

  const { sendPushTokenToWeb } = usePushNotifications(webViewRef, {
    webBaseUrl: WEB_BASE_URL,
    setWebUri: setWebUriStable,
  });

  const applyIncomingUrl = useCallback((url: string | null) => {
    const next = resolveDeepLinkToWebUri(url, WEB_BASE_URL);
    try {
      const u = new URL(next);
      const pathWithQuery = `${u.pathname}${u.search}`;
      if (
        !urlLooksLikeLoginPage(next) &&
        (isTruthyPath(u.pathname) || u.search.length > 0)
      ) {
        deepLinkReturnPathRef.current = pathWithQuery || '/';
      }
    } catch {
      /* ignore */
    }
    setWebUri((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    let sub: { remove: () => void } | undefined;

    (async () => {
      const initial = await Linking.getInitialURL();
      if (initial) applyIncomingUrl(initial);
    })();

    sub = Linking.addEventListener('url', ({ url }) => {
      applyIncomingUrl(url);
    });

    return () => sub?.remove();
  }, [applyIncomingUrl]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });

    return () => handler.remove();
  }, [canGoBack]);

  const hideSplashOnce = useCallback(() => {
    if (splashHiddenRef.current) return;
    splashHiddenRef.current = true;
    void SplashScreen.hideAsync();
  }, []);

  const tryInjectStoredSession = useCallback(
    (url: string) => {
      if (!secureReady || sessionInjectAttemptedRef.current) return;
      if (!urlLooksLikeLoginPage(url)) return;
      const session = sessionRef.current;
      if (!session?.access_token || !session?.refresh_token) return;

      sessionInjectAttemptedRef.current = true;
      const returnPath = deepLinkReturnPathRef.current ?? undefined;
      deepLinkReturnPathRef.current = null;
      const script = buildInjectNativeMessageScript({
        type: 'SESSION_INJECT',
        payload: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          ...(returnPath ? { returnPath } : {}),
        },
      });
      webViewRef.current?.injectJavaScript(script);
    },
    [secureReady, sessionRef]
  );

  useEffect(() => {
    if (!secureReady) return;
    tryInjectStoredSession(lastUrlRef.current);
  }, [secureReady, tryInjectStoredSession]);

  const postFileUploadedToWeb = useCallback((payload: { url: string; filename: string; mime_type: string }) => {
    const script = buildInjectNativeMessageScript({
      type: 'FILE_UPLOADED',
      payload: {
        url: payload.url,
        filename: payload.filename,
        mime_type: payload.mime_type,
      },
    });
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const handlePickImage = useCallback(
    async (payload: { source: 'camera' | 'gallery'; roomId: string }) => {
      const session = sessionRef.current;
      if (!session?.access_token) return;

      const perm =
        payload.source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return;
      }

      const picked =
        payload.source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.9,
            });

      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      const asset = picked.assets[0];
      try {
        const result = await uploadChatImageFromNative(
          session,
          payload.roomId,
          asset.uri,
          asset.mimeType ?? undefined,
          asset.fileSize ?? undefined
        );
        postFileUploadedToWeb(result);
      } catch (e) {
        console.error('[WebViewScreen] upload image', e);
      }
    },
    [sessionRef, postFileUploadedToWeb]
  );

  const handlePickFile = useCallback(
    async (payload: { roomId: string }) => {
      const session = sessionRef.current;
      if (!session?.access_token) return;

      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picked.canceled || !picked.assets?.[0]) return;

      const asset = picked.assets[0];
      try {
        const result = await uploadChatFileFromNative(
          session,
          payload.roomId,
          asset.uri,
          asset.name ?? 'file',
          asset.mimeType ?? undefined,
          asset.size ?? null
        );
        postFileUploadedToWeb(result);
      } catch (e) {
        console.error('[WebViewScreen] upload file', e);
      }
    },
    [sessionRef, postFileUploadedToWeb]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const msg: WebToNativeMessage | null = parseWebMessage(event.nativeEvent.data);
      if (!msg) return;

      switch (msg.type) {
        case 'LOGIN_SUCCESS':
          void saveSession(msg.payload.access_token, msg.payload.refresh_token);
          break;
        case 'LOGOUT':
          void clearSession();
          sessionInjectAttemptedRef.current = false;
          break;
        case 'PICK_IMAGE':
          void handlePickImage(msg.payload);
          break;
        case 'PICK_FILE':
          void handlePickFile(msg.payload);
          break;
        case 'REQUEST_PUSH_TOKEN':
          sendPushTokenToWeb();
          break;
      }
    },
    [sendPushTokenToWeb, saveSession, clearSession, handlePickImage, handlePickFile]
  );

  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadingTimer = useCallback(() => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  const startLoadingTimer = useCallback(() => {
    clearLoadingTimer();
    loadingTimerRef.current = setTimeout(() => {
      setIsLoading(false);
      hideSplashOnce();
    }, 15000);
  }, [clearLoadingTimer, hideSplashOnce]);

  const handleRetryLoad = useCallback(() => {
    setLoadError(null);
    setIsLoading(true);
    initialLoadDoneRef.current = false;
    setRetryNonce((n) => n + 1);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {loadError ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>페이지를 불러올 수 없습니다</Text>
          <Text style={styles.errorBody}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetryLoad}>
            <Text style={styles.retryBtnText}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          key={`${webUri}::${retryNonce}`}
          ref={webViewRef}
          source={{ uri: webUri }}
          style={styles.webview}
          applicationNameForUserAgent={APP_USER_AGENT_SUFFIX}
          onShouldStartLoadWithRequest={(req) => {
            const url = req.url;
            if (shouldOpenExternalAppForUrl(url)) {
              void Linking.openURL(url).catch((e) => {
                console.warn('[WebViewScreen] open external URL failed:', url, e);
                setIsLoading(false);
                clearLoadingTimer();
                if (webViewRef.current && canGoBack) {
                  webViewRef.current.goBack();
                }
              });
              return false;
            }
            return true;
          }}
          onMessage={handleMessage}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
            const { url } = navState;
            lastUrlRef.current = url;
            if (!urlLooksLikeLoginPage(url)) {
              sessionInjectAttemptedRef.current = false;
            }
          }}
          onLoadStart={() => {
            setLoadError(null);
            if (!initialLoadDoneRef.current) {
              setIsLoading(true);
              startLoadingTimer();
            }
          }}
          onLoadEnd={() => {
            clearLoadingTimer();
            setIsLoading(false);
            initialLoadDoneRef.current = true;
            hideSplashOnce();
            sendPushTokenToWeb();
            tryInjectStoredSession(lastUrlRef.current);
          }}
          onError={(e) => {
            clearLoadingTimer();
            const desc = e.nativeEvent.description || '네트워크 연결을 확인해 주세요.';
            setLoadError(desc);
            setIsLoading(false);
            hideSplashOnce();
          }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          startInLoadingState
          renderLoading={() => <LoadingIndicator />}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
        />
      )}

      {isLoading && !loadError && (
        <View style={styles.loadingOverlay}>
          <LoadingIndicator />
        </View>
      )}
    </SafeAreaView>
  );
}

function LoadingIndicator() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#4F46E5" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#111827',
  },
  errorBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
