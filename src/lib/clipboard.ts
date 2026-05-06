import { isNativeApp } from '@/lib/utils';
import { postToNative } from '@/lib/native-bridge';

// 모든 환경에서 동작하는 클립보드 복사.
// - 네이티브 앱: COPY_TEXT 브릿지로 expo-clipboard 사용 (WKWebView user activation 제약 우회).
// - 웹: navigator.clipboard.writeText 가 user gesture 안에서 호출되면 그대로 동작.
// - 비-secure context 등 실패 시 execCommand 폴백.
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  if (isNativeApp()) {
    postToNative({ type: 'COPY_TEXT', payload: { text } });
    return true;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}
