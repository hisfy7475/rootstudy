/**
 * Native <-> WebView postMessage protocol.
 *
 * Native -> Web  : webViewRef.injectJavaScript() or postMessage
 * Web    -> Native: window.ReactNativeWebView.postMessage(JSON.stringify(msg))
 */

// -- Native → Web ----------------------------------------------------------

export type NativeToWebMessage =
  | { type: 'SESSION_INJECT'; payload: { access_token: string; refresh_token: string } }
  | { type: 'PUSH_TOKEN'; payload: { expo_push_token: string; platform: 'ios' | 'android' } }
  | { type: 'FILE_UPLOADED'; payload: { url: string; filename: string; mime_type: string } }
  | { type: 'DEEP_LINK'; payload: { path: string } };

// -- Web → Native -----------------------------------------------------------

export type WebToNativeMessage =
  | { type: 'LOGIN_SUCCESS'; payload: { access_token: string; refresh_token: string } }
  | { type: 'LOGOUT'; payload: Record<string, never> }
  | { type: 'PICK_IMAGE'; payload: { source: 'camera' | 'gallery' } }
  | { type: 'PICK_FILE'; payload: Record<string, never> }
  | { type: 'REQUEST_PUSH_TOKEN'; payload: Record<string, never> };

export function parseWebMessage(raw: string): WebToNativeMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (typeof msg?.type === 'string') return msg as WebToNativeMessage;
  } catch {
    // ignore malformed messages
  }
  return null;
}

/** WebView injectedJavaScript: Native → Web `message` 이벤트 (PushTokenListener 호환). */
export function buildInjectNativeMessageScript(msg: NativeToWebMessage): string {
  const embedded = JSON.stringify(JSON.stringify(msg));
  return `(function(){try{var p=${embedded};window.dispatchEvent(new MessageEvent('message',{data:p}));}catch(e){}})();true;`;
}
