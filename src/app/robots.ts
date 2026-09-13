import type { MetadataRoute } from 'next';

/**
 * 이 앱 전체가 로그인 기반 회원 시스템(app.routestudy.co.kr)이라 검색엔진에 노출할 페이지가 없다.
 * 공개 홈페이지는 별도 도메인(routestudy.co.kr, 홈페이지 제작사 운영)이 담당한다.
 * 호스트 분기 없이 전 경로를 차단한다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
