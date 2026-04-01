import type { ConfigContext, ExpoConfig } from 'expo/config';

const PROD_WEB = 'https://www.rootstudy.co.kr';
const DEV_WEB = 'http://localhost:3000';

function resolveWebBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  if (process.env.EAS_BUILD === 'true') {
    return PROD_WEB;
  }
  if (process.env.NODE_ENV === 'production') {
    return PROD_WEB;
  }
  return DEV_WEB;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const webBaseUrl = resolveWebBaseUrl();
  const extra =
    typeof config.extra === 'object' && config.extra !== null
      ? { ...config.extra, webBaseUrl }
      : { webBaseUrl };

  const ios = config.ios ?? {};
  const android = config.android ?? {};

  return {
    ...config,
    extra,
    ios: {
      ...ios,
      associatedDomains: [
        'applinks:www.rootstudy.co.kr',
        'applinks:rootstudy.co.kr',
      ],
    },
    android: {
      ...android,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'www.rootstudy.co.kr',
              pathPrefix: '/',
            },
            {
              scheme: 'https',
              host: 'rootstudy.co.kr',
              pathPrefix: '/',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
  } as ExpoConfig;
};
