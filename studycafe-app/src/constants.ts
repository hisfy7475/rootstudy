import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { webBaseUrl?: string };

export const WEB_BASE_URL: string =
  extra.webBaseUrl ?? 'https://studycafe.weberstudy.com';

export const WEB_HOST = 'studycafe.weberstudy.com';

export const URL_SCHEME = 'weberstudy';

export const APP_USER_AGENT_SUFFIX = 'WeberStudyApp/1.0';
