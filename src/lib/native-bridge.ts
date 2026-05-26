/**
 * Expo WebView ↔ Next.js 웹 postMessage 규약 (studycafe-app/src/utils/bridge.ts 와 동일).
 * Web에서는 window.ReactNativeWebView.postMessage 로 Native에 전달합니다.
 */

// PICK 요청·응답이 어느 화면(채팅·멘토링 신청)에서 발생했는지를 구분하기 위한 컨텍스트.
// 동일 WebView 안에 두 화면이 잔존할 수 있어, 응답이 잘못된 화면에 라우팅되지 않도록 메시지에 echo 한다.
export type NativeUploadContext = 'chat' | 'mentoring';

export type NativeToWebMessage =
  | {
      type: 'SESSION_INJECT';
      payload: { access_token: string; refresh_token: string; returnPath?: string };
    }
  | { type: 'PUSH_TOKEN'; payload: { expo_push_token: string; platform: 'ios' | 'android' } }
  | {
      type: 'FILE_UPLOADED';
      payload: {
        url: string;
        filename: string;
        mime_type: string;
        context: NativeUploadContext;
      };
    }
  | {
      type: 'FILE_UPLOAD_ERROR';
      payload: { message: string; context: NativeUploadContext };
    }
  | { type: 'DEEP_LINK'; payload: { path: string } };

export type WebToNativeMessage =
  | {
      type: 'LOGIN_SUCCESS';
      // remember: 자동로그인 유지 여부. false면 네이티브는 SecureStore에 저장하지 않고
      // 메모리(sessionRef)에만 보관하여 앱 재실행 시 자동 복원을 막는다.
      payload: { access_token: string; refresh_token: string; remember?: boolean };
    }
  | { type: 'LOGOUT'; payload: Record<string, never> }
  | {
      type: 'PICK_IMAGE';
      payload: {
        source: 'camera' | 'gallery';
        context: NativeUploadContext;
        // chat 컨텍스트에서만 사용. mentoring 은 신청 폼 단일 컨텍스트라 별도 식별자 불필요.
        roomId?: string;
      };
    }
  | {
      type: 'PICK_FILE';
      payload: {
        context: NativeUploadContext;
        roomId?: string;
      };
    }
  | { type: 'REQUEST_PUSH_TOKEN'; payload: Record<string, never> }
  | { type: 'COPY_TEXT'; payload: { text: string } };

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
