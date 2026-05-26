import { Linking, Platform } from 'react-native';
import { dispatchAndroidIntent } from '../../modules/intent-launcher/src';

export type DispatchResult = {
  handled: boolean;
  reason: string;
};

/**
 * 내부 복귀 스킴 — 외부 위임이 아니라 우리 앱이 직접 처리해야 함.
 */
const INTERNAL_SCHEMES = ['rootstudy://', 'exp+studycafe-app://'];

function isInternalScheme(url: string): boolean {
  const lower = url.toLowerCase();
  return INTERNAL_SCHEMES.some((s) => lower.startsWith(s));
}

/**
 * 외부 결제·카드사·백신 앱으로 디스패치.
 *
 * - intent:// (Android): Intent.parseUri 기반 네이티브 모듈로 위임.
 * - 그 외 커스텀 스킴: Linking.openURL try-then-fallback (canOpenURL false negative 회피).
 *
 * 결과의 handled=false 인 경우 호출자가 사용자 안내·복구 처리.
 */
export async function dispatchExternal(url: string): Promise<DispatchResult> {
  if (isInternalScheme(url)) {
    return { handled: false, reason: 'internal_scheme' };
  }

  const lower = url.toLowerCase();

  // intent: 와 intent:// 둘 다 합법 (// 는 host가 없을 때 생략 가능 — Android Intent URI 스펙).
  if (Platform.OS === 'android' && lower.startsWith('intent:')) {
    const res = await dispatchAndroidIntent(url);
    return { handled: res.handled, reason: res.reason };
  }

  // 일반 커스텀 스킴 — 사전 canOpenURL 체크 없이 바로 시도.
  try {
    await Linking.openURL(url);
    return { handled: true, reason: 'opened' };
  } catch {
    return { handled: false, reason: 'open_failed' };
  }
}
