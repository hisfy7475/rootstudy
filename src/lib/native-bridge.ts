/**
 * Expo WebView ↔ Next.js 웹 postMessage 규약 (studycafe-app/src/utils/bridge.ts 와 동일).
 * Web에서는 window.ReactNativeWebView.postMessage 로 Native에 전달합니다.
 */

export type NativeToWebMessage =
  | { type: 'SESSION_INJECT'; payload: { access_token: string; refresh_token: string } }
  | { type: 'PUSH_TOKEN'; payload: { expo_push_token: string; platform: 'ios' | 'android' } }
  | { type: 'FILE_UPLOADED'; payload: { url: string; filename: string; mime_type: string } }
  | { type: 'DEEP_LINK'; payload: { path: string } };

export type WebToNativeMessage =
  | { type: 'LOGIN_SUCCESS'; payload: { access_token: string; refresh_token: string } }
  | { type: 'LOGOUT'; payload: Record<string, never> }
  | { type: 'PICK_IMAGE'; payload: { source: 'camera' | 'gallery' } }
  | { type: 'PICK_FILE'; payload: Record<string, never> }
  | { type: 'REQUEST_PUSH_TOKEN'; payload: Record<string, never> };

type RNWebViewWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

export function postToNative(msg: WebToNativeMessage): void {
  if (typeof window === 'undefined') return;
  const w = window as RNWebViewWindow;
  w.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}

export function onNativeMessage(handler: (msg: NativeToWebMessage) => void): () => void {
  const listener = (event: MessageEvent) => {
    const raw = typeof event.data === 'string' ? event.data : null;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as NativeToWebMessage;
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        handler(parsed);
      }
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
