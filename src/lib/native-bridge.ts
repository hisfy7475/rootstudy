/**
 * Expo WebView ↔ Next.js 웹 postMessage 규약 (studycafe-app/src/utils/bridge.ts 와 동일).
 * Web에서는 window.ReactNativeWebView.postMessage 로 Native에 전달합니다.
 */

import { isNativeApp } from './utils';

// PICK 요청·응답이 어느 화면(채팅·멘토링 신청)에서 발생했는지를 구분하기 위한 컨텍스트.
// 동일 WebView 안에 두 화면이 잔존할 수 있어, 응답이 잘못된 화면에 라우팅되지 않도록 메시지에 echo 한다.
export type NativeUploadContext = 'chat' | 'mentoring';

export type NativeToWebMessage =
  | {
      type: 'SESSION_INJECT';
      payload: { access_token: string; refresh_token: string; returnPath?: string };
    }
  // 네이티브가 업로드 직전 세션을 자동 갱신(refresh 토큰 회전)했을 때, 회전된 새 토큰을
  // 브라우저 세션에도 반영시키기 위한 메시지. SESSION_INJECT 와 달리 navigate 하지 않는다.
  // 이걸로 브라우저가 이후 stale 한(이미 회전된) refresh 토큰을 재제출해 세션 패밀리가
  // revoke 되는(웹·앱 동시 로그아웃) 경로를 차단한다. AuthBridge 가 setSession 으로 처리.
  | {
      type: 'SESSION_SYNC';
      payload: { access_token: string; refresh_token: string };
    }
  | { type: 'PUSH_TOKEN'; payload: { expo_push_token: string; platform: 'ios' | 'android' } }
  | {
      type: 'FILE_UPLOADED';
      payload: {
        url: string;
        filename: string;
        mime_type: string;
        context: NativeUploadContext;
        // chat 컨텍스트에서 어느 방으로 picked 됐는지 echo. 멀티룸(관리자) 오라우팅 방지용.
        // 구버전 앱은 미포함이라 웹 핸들러는 없으면 폴백 처리한다.
        roomId?: string;
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
  | { type: 'COPY_TEXT'; payload: { text: string } }
  // 첨부(파일·이미지) 열기 요청. 네이티브가 앱 안 브라우저로 미리보기+저장+닫기를 제공한다.
  // 네비게이션 가로채기 대신 postMessage 로 넘기는 이유: Android 는 파일 링크가 DownloadListener 로
  // 새고(shouldOverrideUrlLoading 미발화), 이미지의 programmatic navigation 도 콜백을 안 타 신뢰 불가.
  | { type: 'OPEN_ATTACHMENT'; payload: { url: string } };

type RNWebViewWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

export function postToNative(msg: WebToNativeMessage): void {
  if (typeof window === 'undefined') return;
  const w = window as RNWebViewWindow;
  w.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}

/** 네이티브 앱에서 첨부(파일·이미지) URL 을 앱 안 브라우저로 열도록 요청한다. */
export function openAttachmentNative(url: string): void {
  postToNative({ type: 'OPEN_ATTACHMENT', payload: { url } });
}

/**
 * 첨부 링크(`<a>`) onClick 헬퍼. 네이티브 앱이면 기본 네비게이션/다운로드를 막고 인앱 브라우저로 연다.
 * 웹(PC)에서는 아무것도 하지 않아 `<a href download target=_blank>` 기본 동작이 유지된다.
 */
export function handleNativeAttachmentClick(e: { preventDefault: () => void }, url: string): void {
  if (!isNativeApp()) return;
  e.preventDefault();
  openAttachmentNative(url);
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

/**
 * 네이티브 업로드 에러 메시지가 "세션 만료" 사유인지 판별한다.
 *
 * 9ffa98d 이전(구버전) 네이티브 앱은 세션 만료 시 전용 신호 없이 FILE_UPLOAD_ERROR 로
 * "로그인 세션이 만료되었습니다…" 문구를 보낸다. 웹이 이를 골라내 raw alert 대신 전역
 * SessionExpiredDialog(재로그인 안내)로 라우팅하기 위한 판별(구버전 호환 shim).
 * 코드 필드가 없어 문자열 매칭이 유일한 수단이며, 다른 업로드 에러 문구에는 "세션이 만료"가
 * 없어 오탐이 없다. (신버전 네이티브는 rootstudy:session-expired 를 직접 쏘므로 여기 안 옴.)
 */
export function isSessionExpiredUploadMessage(message?: string): boolean {
  return typeof message === 'string' && message.includes('세션이 만료');
}

/**
 * 에러 메시지가 "세션 만료/재로그인 필요" 계열인지 판별한다(업로드·전송 공통).
 * - 업로드 실패: "…세션이 만료…" (네이티브 SessionExpiredError, uploads/client.ts)
 * - 전송 실패: "로그인이 필요합니다." (서버 액션 getUser 실패 시 반환 → send 훅이 throw)
 * 두 경우 모두 막다른 alert 대신 전역 SessionExpiredDialog(재로그인)로 유도하기 위한 판별.
 */
export function isSessionErrorMessage(message?: string): boolean {
  return (
    typeof message === 'string' &&
    (message.includes('세션이 만료') || message.includes('로그인이 필요'))
  );
}
