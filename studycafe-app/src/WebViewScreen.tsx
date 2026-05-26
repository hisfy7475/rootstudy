import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { WEB_BASE_URL, APP_USER_AGENT_SUFFIX } from "./constants";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useSecureTokenStore } from "./hooks/useSecureTokenStore";
import { uploadChatFileFromNative, uploadChatImageFromNative } from "./lib/nativeChatUpload";
import {
  buildInjectNativeMessageScript,
  parseWebMessage,
  WebToNativeMessage,
} from "./utils/bridge";
import { resolveDeepLinkToWebUri } from "./utils/deepLink";
import { shouldOpenExternalAppForUrl } from "./utils/schemes";

function urlLooksLikeLoginPage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === "/login" || u.pathname.endsWith("/login");
  } catch {
    return url.includes("/login");
  }
}

function isTruthyPath(pathname: string): boolean {
  return pathname !== "/" && pathname !== "";
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

  // 네이티브가 측정한 bottom inset을 WebView의 CSS 변수로 브릿지.
  // Android System WebView는 env(safe-area-inset-*)을 0으로 반환하므로 bottom은 native 측정값이 필요.
  // top은 SafeAreaView(edges=["top",...])가 WebView 자체를 상태바 아래로 밀어 단일 출처로 흡수하므로
  // 여기서 주입하지 않는다. (주입 시 SafeAreaView padding + .pt-safe 가 더블 적용되어 헤더 위 빈 공간 발생)
  const insets = useSafeAreaInsets();
  const insetsRef = useRef(insets);
  useEffect(() => {
    insetsRef.current = insets;
  }, [insets]);

  // <html>의 inline style을 mutate하면 Next.js SSR과 하이드레이션 mismatch가 발생한다.
  // (서버 HTML에는 style 속성이 없는데 네이티브 주입으로 클라이언트 DOM에는 생김)
  // 대신 <head>에 전용 <style> 노드를 추가/갱신한다. 외부 추가 노드는 React hydration이 허용.
  const injectSafeAreaVars = useCallback((bottom: number) => {
    const script = `(()=>{try{var id='__app-native-safe-area';var el=document.getElementById(id);if(!el){el=document.createElement('style');el.id=id;(document.head||document.documentElement).appendChild(el);}el.textContent=':root{--app-native-safe-bottom:${bottom}px;}';}catch(e){}})();true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  useEffect(() => {
    injectSafeAreaVars(insets.bottom);
  }, [insets.bottom, injectSafeAreaVars]);

  // iOS 키보드는 fixed BottomNav를 가린다. 키보드 높이를 web에 publish 하여 BottomNav 숨김 처리.
  // Android는 windowSoftInputMode=adjustResize 로 viewport 자체가 줄어 자동 해결되므로 iOS 한정.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const inject = (h: number) => {
      const script = `(()=>{try{var r=document.documentElement;r.style.setProperty('--app-keyboard-height','${h}px');r.classList.toggle('keyboard-open',${h > 0});}catch(e){}})();true;`;
      webViewRef.current?.injectJavaScript(script);
    };
    const showSub = Keyboard.addListener("keyboardWillShow", (e) =>
      inject(e.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener("keyboardWillHide", () => inject(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const { ready: secureReady, sessionRef, saveSession, saveEphemeral, clearSession } =
    useSecureTokenStore();

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
      if (!urlLooksLikeLoginPage(next) && (isTruthyPath(u.pathname) || u.search.length > 0)) {
        deepLinkReturnPathRef.current = pathWithQuery || "/";
      }
    } catch {
      /* ignore */
    }
    setWebUri((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    (async () => {
      const initial = await Linking.getInitialURL();
      if (initial) applyIncomingUrl(initial);
    })();

    const sub = Linking.addEventListener("url", ({ url }) => {
      applyIncomingUrl(url);
    });

    return () => sub.remove();
  }, [applyIncomingUrl]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
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
        type: "SESSION_INJECT",
        payload: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          ...(returnPath ? { returnPath } : {}),
        },
      });
      webViewRef.current?.injectJavaScript(script);
    },
    [secureReady, sessionRef],
  );

  useEffect(() => {
    if (!secureReady) return;
    tryInjectStoredSession(lastUrlRef.current);
  }, [secureReady, tryInjectStoredSession]);

  const postFileUploadedToWeb = useCallback(
    (payload: { url: string; filename: string; mime_type: string }) => {
      const script = buildInjectNativeMessageScript({
        type: "FILE_UPLOADED",
        payload: {
          url: payload.url,
          filename: payload.filename,
          mime_type: payload.mime_type,
        },
      });
      webViewRef.current?.injectJavaScript(script);
    },
    [],
  );

  // 네이티브 업로드 실패를 웹에 전달해 사용자에게 토스트로 알린다.
  // 에러 메시지에 토큰/경로 등 민감 정보가 섞이지 않도록 nativeChatUpload 측에서
  // 사용자 노출 안전한 한글 문구로만 throw 하도록 보장되어야 한다.
  const postFileUploadErrorToWeb = useCallback((message: string) => {
    const safe =
      typeof message === "string" && message.length > 0 && message.length < 200
        ? message
        : "파일 업로드에 실패했습니다.";
    const script = buildInjectNativeMessageScript({
      type: "FILE_UPLOAD_ERROR",
      payload: { message: safe },
    });
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const handlePickImage = useCallback(
    async (payload: { source: "camera" | "gallery"; roomId: string }) => {
      const session = sessionRef.current;
      if (!session?.access_token) return;

      const perm =
        payload.source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return;
      }

      let picked: ImagePicker.ImagePickerResult;
      try {
        picked =
          payload.source === "camera"
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ["images"],
                quality: 0.9,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                quality: 0.9,
              });
      } catch (pickErr: unknown) {
        if (
          Platform.OS === "ios" &&
          payload.source !== "camera" &&
          String(pickErr).includes("public.heic")
        ) {
          try {
            picked = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.9,
              allowsEditing: true,
            });
          } catch (retryErr) {
            console.error("[WebViewScreen] HEIC retry also failed", retryErr);
            return;
          }
        } else {
          console.error("[WebViewScreen] pick image failed", pickErr);
          return;
        }
      }

      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      const asset = picked.assets[0];
      try {
        const result = await uploadChatImageFromNative(
          session,
          payload.roomId,
          asset.uri,
          asset.mimeType ?? undefined,
          asset.fileSize ?? undefined,
        );
        postFileUploadedToWeb(result);
      } catch (e) {
        console.error("[WebViewScreen] upload image", e);
        postFileUploadErrorToWeb(
          e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.",
        );
      }
    },
    [sessionRef, postFileUploadedToWeb, postFileUploadErrorToWeb],
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
          asset.name ?? "file",
          asset.mimeType ?? undefined,
          asset.size ?? null,
        );
        postFileUploadedToWeb(result);
      } catch (e) {
        console.error("[WebViewScreen] upload file", e);
        postFileUploadErrorToWeb(
          e instanceof Error ? e.message : "파일 업로드에 실패했습니다.",
        );
      }
    },
    [sessionRef, postFileUploadedToWeb, postFileUploadErrorToWeb],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const msg: WebToNativeMessage | null = parseWebMessage(event.nativeEvent.data);
      if (!msg) return;

      switch (msg.type) {
        case "LOGIN_SUCCESS":
          // remember가 명시적 false면 SecureStore 비저장(메모리만). 미지정/true는 기존 영구 저장 경로.
          if (msg.payload.remember === false) {
            saveEphemeral(msg.payload.access_token, msg.payload.refresh_token);
          } else {
            void saveSession(msg.payload.access_token, msg.payload.refresh_token);
          }
          break;
        case "LOGOUT":
          void clearSession();
          sessionInjectAttemptedRef.current = false;
          break;
        case "PICK_IMAGE":
          void handlePickImage(msg.payload);
          break;
        case "PICK_FILE":
          void handlePickFile(msg.payload);
          break;
        case "REQUEST_PUSH_TOKEN":
          sendPushTokenToWeb();
          break;
        case "COPY_TEXT":
          void Clipboard.setStringAsync(msg.payload.text);
          break;
      }
    },
    [sendPushTokenToWeb, saveSession, saveEphemeral, clearSession, handlePickImage, handlePickFile],
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
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
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
                console.warn("[WebViewScreen] open external URL failed:", url, e);
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
            // 페이지 전환 시 CSS 변수가 초기화되므로 재주입.
            injectSafeAreaVars(insetsRef.current.bottom);
          }}
          onError={(e) => {
            clearLoadingTimer();
            const desc = e.nativeEvent.description || "네트워크 연결을 확인해 주세요.";
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
      <ActivityIndicator size='large' color='#4F46E5' />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  errorWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    color: "#111827",
  },
  errorBody: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: "#4F46E5",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
});
