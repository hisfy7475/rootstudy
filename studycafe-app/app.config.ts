import type { ConfigContext, ExpoConfig } from 'expo/config';

function resolveWebBaseUrl(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim();
  return fromEnv ? fromEnv.replace(/\/$/, '') : undefined;
}

const buildExpoConfig = ({ config }: ConfigContext): ExpoConfig => {
  const webBaseUrl = resolveWebBaseUrl();
  const baseExtra =
    typeof config.extra === 'object' && config.extra !== null ? config.extra : {};
  const extra = webBaseUrl ? { ...baseExtra, webBaseUrl } : { ...baseExtra };

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

export default buildExpoConfig;
