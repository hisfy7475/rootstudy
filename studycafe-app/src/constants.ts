import Constants from 'expo-constants';

const PROD_WEB = 'https://www.rootstudy.co.kr';
const DEV_WEB_PORT = 3000;

function resolveWebBaseUrl(): string {
  const fromExtra = (Constants.expoConfig?.extra as { webBaseUrl?: string } | undefined)
    ?.webBaseUrl;
  if (fromExtra) {
    return fromExtra.replace(/\/$/, '');
  }

  if (__DEV__) {
    const hostUri = Constants.expoConfig?.hostUri ?? '';
    const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
    if (host) {
      return `http://${host}:${DEV_WEB_PORT}`;
    }
  }

  return PROD_WEB;
}

export const WEB_BASE_URL: string = resolveWebBaseUrl();

/** 딥링크/앱링크에 쓰이는 등록 도메인(www 유무 무관 매칭) */
export const WEB_HOST = 'rootstudy.co.kr';

export const URL_SCHEME = 'rootstudy';

export const APP_USER_AGENT_SUFFIX = 'RootStudyApp/1.0';

/** Next 웹과 동일한 공개 env. `studycafe-app/.env`에 설정 (EXPO_PUBLIC_*) */
export const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export const SUPABASE_ANON_KEY: string =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
