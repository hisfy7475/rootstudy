import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type IntentDispatchReason =
  | 'opened'
  | 'store'
  | 'fallback'
  | 'no_resolver'
  | 'parse_error'
  | 'start_failed'
  | 'unsupported_platform';

export type IntentDispatchResult = {
  handled: boolean;
  reason: IntentDispatchReason;
};

type NativeModule = {
  dispatchAndroidIntent: (
    url: string,
    fallbackUrl?: string | null,
  ) => Promise<IntentDispatchResult>;
};

const nativeModule = requireOptionalNativeModule<NativeModule>('IntentLauncher');

/**
 * 안드로이드 intent:// URL을 OS 표준 Intent.parseUri 로 디스패치.
 * iOS 또는 모듈 미로드 시 unsupported_platform 반환.
 */
export async function dispatchAndroidIntent(
  url: string,
  fallbackUrl?: string | null,
): Promise<IntentDispatchResult> {
  if (Platform.OS !== 'android' || !nativeModule) {
    return { handled: false, reason: 'unsupported_platform' };
  }
  try {
    return await nativeModule.dispatchAndroidIntent(url, fallbackUrl ?? null);
  } catch {
    return { handled: false, reason: 'start_failed' };
  }
}
