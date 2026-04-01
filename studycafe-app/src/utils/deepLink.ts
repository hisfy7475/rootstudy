import * as Linking from 'expo-linking';

import { URL_SCHEME, WEB_BASE_URL, WEB_HOST } from '../constants';

function normalizeBase(url: string): string {
  return url.replace(/\/$/, '');
}

type ExpoParsed = {
  scheme: string | null;
  hostname: string | null;
  path: string | null;
  queryParams: Record<string, string | string[]>;
};

/**
 * 딥링크 URL을 WebView에 로드할 절대 HTTPS URI로 변환한다.
 * - rootstudy://student/chat → {WEB_BASE_URL}/student/chat
 * - https://www.rootstudy.co.kr/... → 동일 경로·쿼리 (호스트만 검증)
 */
export function resolveDeepLinkToWebUri(
  incoming: string | null | undefined,
  baseUrl: string = WEB_BASE_URL
): string {
  if (!incoming || typeof incoming !== 'string') {
    return baseUrl;
  }

  const trimmed = incoming.trim();
  if (!trimmed) return baseUrl;

  const base = normalizeBase(baseUrl);

  try {
    const u = new URL(trimmed);

    if (u.protocol === 'http:' || u.protocol === 'https:') {
      if (u.hostname === WEB_HOST || u.hostname === `www.${WEB_HOST}`) {
        const path = `${u.pathname}${u.search}` || '/';
        return `${base}${path}`;
      }
      return base;
    }

    if (u.protocol === `${URL_SCHEME}:`) {
      const host = u.hostname;
      const pathname = u.pathname || '';
      const search = u.search || '';
      if (host) {
        const p =
          `${pathname === '/' ? '' : pathname}${search}` || '';
        return `${base}/${host}${p}`;
      }
      if (pathname && pathname !== '/') {
        return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}${search}`;
      }
      return base;
    }
  } catch {
    // custom scheme 등 URL 생성 실패 시 expo Linking.parse 시도
  }

  try {
    const parsed = Linking.parse(trimmed) as ExpoParsed;

    if (parsed.scheme === 'http' || parsed.scheme === 'https') {
      const host = parsed.hostname ?? '';
      if (host === WEB_HOST || host === `www.${WEB_HOST}`) {
        return `${base}${joinPathAndQuery(parsed.path, parsed.queryParams)}`;
      }
      return base;
    }

    if (parsed.scheme === URL_SCHEME) {
      const p = pathFromAppUrlScheme(parsed);
      return `${base}${p.startsWith('/') ? p : `/${p}`}`;
    }
  } catch {
    // ignore
  }

  return base;
}

function joinPathAndQuery(
  path: string | null | undefined,
  queryParams: Record<string, string | string[]>
): string {
  let p = path ?? '';
  if (!p || p === '/') p = '/';
  else if (!p.startsWith('/')) p = `/${p}`;

  const q = serializeQueryParams(queryParams);
  return `${p}${q}`;
}

function serializeQueryParams(
  queryParams: Record<string, string | string[]>
): string {
  if (!queryParams || Object.keys(queryParams).length === 0) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(queryParams)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
      }
    } else if (v != null && v !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function pathFromAppUrlScheme(parsed: ExpoParsed): string {
  const host = parsed.hostname ?? '';
  let path = parsed.path ?? '';
  if (path.startsWith('/')) path = path.slice(1);

  if (host && path) return `/${host}/${path}`;
  if (host) return `/${host}`;
  if (path) return path.startsWith('/') ? path : `/${path}`;
  return '/';
}
