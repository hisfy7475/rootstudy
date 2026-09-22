import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';

/** 301 로 이전이 끝난 구 도메인. 이 호스트는 Vercel 엣지에서 전 경로가 301 된다. */
const LEGACY_HOSTS = new Set(['rootstudy.co.kr', 'www.rootstudy.co.kr']);

/**
 * 호스트별로 다르게 응답한다.
 *
 * - 구 도메인(rootstudy.co.kr): **수집 허용**. 전 경로가 301 인데 robots.txt 로 막으면
 *   크롤러가 301 자체를 읽지 못해 색인이 새 도메인으로 이전되지 않고, 기존 색인이
 *   "robots.txt 로 인해 정보를 수집할 수 없습니다" 상태로 잔존한다.
 * - 회원 시스템(app.routestudy.co.kr): **수집 허용 + noindex**(layout.tsx 메타 +
 *   next.config 의 X-Robots-Tag). 검색 제외는 noindex 로 하는 것이지 robots.txt 차단으로
 *   하는 게 아니다. 차단하면 크롤러가 noindex 를 읽지 못해 오히려 색인에서 빠지지 않는다.
 *   크롤 부하가 무의미한 `/api` 만 제외한다.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host')?.toLowerCase().split(':')[0] ?? '';

  if (LEGACY_HOSTS.has(host)) {
    return {
      rules: {
        userAgent: '*',
        allow: '/',
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
  };
}
