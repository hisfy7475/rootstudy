import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { WEB_BASE_URL, APP_USER_AGENT_SUFFIX } from './constants';
import { parseWebMessage, WebToNativeMessage } from './utils/bridge';
import { resolveDeepLinkToWebUri } from './utils/deepLink';

export default function WebViewScreen() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [webUri, setWebUri] = useState(WEB_BASE_URL);
  const splashHiddenRef = useRef(false);

  const applyIncomingUrl = useCallback((url: string | null) => {
    const next = resolveDeepLinkToWebUri(url, WEB_BASE_URL);
    setWebUri((prev) => (prev === next ? prev : next));
  }, []);

  // -- 딥링크 (cold / warm) --------------------------------------------------

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

  // -- Android back button ---------------------------------------------------

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

  // -- postMessage handler ---------------------------------------------------

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const msg: WebToNativeMessage | null = parseWebMessage(event.nativeEvent.data);
    if (!msg) return;

    switch (msg.type) {
      case 'LOGIN_SUCCESS':
        break;
      case 'LOGOUT':
        break;
      case 'PICK_IMAGE':
        break;
      case 'PICK_FILE':
        break;
      case 'REQUEST_PUSH_TOKEN':
        break;
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <WebView
        key={webUri}
        ref={webViewRef}
        source={{ uri: webUri }}
        style={styles.webview}
        applicationNameForUserAgent={APP_USER_AGENT_SUFFIX}
        onMessage={handleMessage}
        onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => {
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

      {isLoading && (
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
});
