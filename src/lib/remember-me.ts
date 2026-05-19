/**
 * 자동로그인 유지 옵션 클라이언트 헬퍼.
 *
 * 사용자가 로그인 시 선택한 "자동로그인 유지" 여부를 비-httpOnly 쿠키
 * `wstudy_remember=1|0` 으로 저장한다. 서버(`src/lib/supabase/server.ts`,
 * `src/middleware.ts`)는 이 쿠키를 읽어 Supabase 인증 쿠키의 maxAge/expires
 * 적용 여부를 분기한다.
 *
 * 쿠키 자체의 영속성도 사용자 선택에 맞춰 분기한다:
 *   - 체크 ON  → 1년 영속 (Supabase 쿠키와 동일 라이프사이클)
 *   - 체크 OFF → 세션쿠키 (브라우저 종료 시 만료)
 */

export const REMEMBER_COOKIE = 'wstudy_remember';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** 브라우저에서 wstudy_remember 쿠키를 set한다. */
export function setRememberCookie(remember: boolean): void {
  if (typeof document === 'undefined') return;
  // 잔존 영구쿠키가 같은 name이지만 host-only/domain 미묘 차이로 살아남아
  // 새 값이 덮어쓰여지지 않는 케이스를 차단하기 위해 항상 한 번 비운 뒤 set.
  clearRememberCookie();
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const base = `${REMEMBER_COOKIE}=${remember ? '1' : '0'}; Path=/; SameSite=Lax${secure}`;
  // ON: 1년 영속 / OFF: 세션쿠키 (Max-Age 미지정)
  document.cookie = remember ? `${base}; Max-Age=${ONE_YEAR_SECONDS}` : base;
}

/** 브라우저에서 wstudy_remember 쿠키를 즉시 삭제한다 (로그아웃 정리용). */
export function clearRememberCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${REMEMBER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** 현재 쿠키 값을 읽어 자동로그인 유지 여부를 반환. 미설정 시 true 기본. */
export function readRememberCookie(): boolean {
  if (typeof document === 'undefined') return true;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${REMEMBER_COOKIE}=([^;]+)`));
  if (!match) return true;
  return match[1] !== '0';
}
