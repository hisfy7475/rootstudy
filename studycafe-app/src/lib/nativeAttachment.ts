import * as WebBrowser from "expo-web-browser";

import { SUPABASE_URL } from "../constants";

/**
 * 채팅/멘토링/공지 첨부(파일·이미지)를 앱 안 브라우저로 열어 미리보기·저장·닫기를 제공한다.
 *
 * 웹은 첨부를 Supabase Storage public URL 로 렌더한다(파일은 `<a href=... download>`,
 * 이미지는 클릭 시 네비게이션). 네이티브 WebView 가 이 URL 을 그대로 이동하면 닫기 UI 없는
 * 인라인 미리보기로 화면을 이탈한다. → WebViewScreen 이 이 URL 을 가로채 여기서
 * `openBrowserAsync`(iOS SafariVC / Android Custom Tabs)로 연다.
 *   - 즉시 미리보기(pdf·이미지) + Done/닫기 + 공유 → "파일에 저장"/"이미지 저장"
 *   - iOS·Android 동일 동작.
 */

const STORAGE_PUBLIC_MARKER = "/storage/v1/object/public/";

/**
 * Supabase Storage 첨부(public 오브젝트) URL 판별.
 * origin 일치 + `/storage/v1/object/public/`. 파일(`?download=`)·이미지 공통.
 * SUPABASE_URL 미설정('') 등 파싱 실패 시 false.
 * 이미지 `<img>` 는 서브리소스라 네비게이션 콜백을 타지 않으므로, 실제 사용자 탭(네비게이션)만 가로챈다.
 */
export function isStorageAttachmentUrl(url: string): boolean {
  try {
    const base = new URL(SUPABASE_URL); // '' 이면 throw → catch
    const u = new URL(url);
    return (
      u.origin === base.origin && u.pathname.includes(STORAGE_PUBLIC_MARKER)
    );
  } catch {
    return false;
  }
}

/** `?download=`(첨부 강제) 쿼리를 떼어 브라우저가 다운로드 대신 인라인 미리보기를 하도록 유도. */
function toPreviewUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("download");
    return u.toString();
  } catch {
    return url;
  }
}

/** 첨부를 앱 안 브라우저로 연다. 브라우저가 미리보기·공유(저장)·닫기를 모두 제공한다. */
export async function openAttachmentInBrowser(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(toPreviewUrl(url), {
    dismissButtonStyle: "done", // iOS: 닫기 버튼을 'Done' 으로
    showTitle: true, // Android: 커스텀 탭 상단에 제목 표시
    enableBarCollapsing: false,
  });
}
