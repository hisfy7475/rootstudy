import { createServerClient } from '@supabase/ssr';
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
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll 호출이 Server Component에서 발생할 경우
            // 무시해도 됨 - 미들웨어에서 세션 갱신을 처리함
          }
        },
      },
    }
  );
}
