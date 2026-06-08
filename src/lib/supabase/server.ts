import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createClient(): Promise<ReturnType<typeof createServerClient<any>>> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // 자동로그인 유지 옵션. 사용자가 OFF로 로그인하면 wstudy_remember=0 이
          // set돼 있고, Supabase 인증 쿠키를 세션쿠키(Max-Age/Expires 없음)로 발급한다.
          // 보안 옵션(httpOnly/secure/sameSite/path/domain)은 반드시 보존.
          const remember = cookieStore.get('wstudy_remember')?.value !== '0';
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (remember) {
                cookieStore.set(name, value, options);
              } else {
                // 세션쿠키로 발급. 보안 옵션은 보존하고 maxAge/expires만 제거.
                const rest = { ...(options ?? {}) };
                delete (rest as { maxAge?: number }).maxAge;
                delete (rest as { expires?: Date }).expires;
                cookieStore.set(name, value, rest);
              }
            });
          } catch {
            // setAll 호출이 Server Component에서 발생할 경우
            // 무시해도 됨 - 미들웨어에서 세션 갱신을 처리함
          }
        },
      },
    },
  );
}

/**
 * Service Role 클라이언트 생성 (RLS 우회)
 * 회원가입 등 인증 전 DB 작업에 사용
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAdminClient(): ReturnType<typeof createSupabaseClient<any>> {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * 쿠키 비바인딩 raw 클라이언트 (anon key, 세션 미영속).
 * 현재 비밀번호 재인증·recovery OTP 검증처럼, 본 세션 쿠키를 오염시키면 안 되는
 * 일회성 auth 호출에 사용한다. 쿠키 바인딩 createClient()로 두 번째 auth write를 하면
 * SSR setAll 콜백이 세션 쿠키를 회전/덮어써 서버 액션/미들웨어와 충돌하므로 이 클라이언트로 격리한다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createIsolatedAuthClient(): ReturnType<typeof createSupabaseClient<any>> {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

/**
 * 현재 비밀번호를 본 세션을 건드리지 않고 검증한다. 일치하면 true.
 * 격리 클라이언트로 signInWithPassword를 시도해, 검증 부작용(세션 쿠키 회전)을 차단한다.
 */
export async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const { error } = await createIsolatedAuthClient().auth.signInWithPassword({ email, password });
  return !error;
}
