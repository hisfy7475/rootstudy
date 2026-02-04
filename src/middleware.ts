import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 사용자 세션 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 인증이 필요없는 경로
  const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password'];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // 사용자 타입별 경로 매핑
  const userTypeRoutes: Record<string, string> = {
    student: '/student',
    parent: '/parent',
    admin: '/admin',
  };

  // 미인증 사용자가 보호된 경로 접근 시
  if (!user && !isPublicPath && pathname !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 인증된 사용자 처리
  if (user) {
    // 프로필 정보 가져오기
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single();

    const userType = profile?.user_type as string | undefined;
    const correctPath = userType ? userTypeRoutes[userType] : null;

    // 인증된 사용자가 공개 경로(로그인, 회원가입 등) 접근 시 → 본인 타입 페이지로 리다이렉트
    if (isPublicPath && correctPath) {
      const url = request.nextUrl.clone();
      url.pathname = correctPath;
      return NextResponse.redirect(url);
    }

    // 루트 경로 접근 시 → 본인 타입 페이지로 리다이렉트
    if (pathname === '/' && correctPath) {
      const url = request.nextUrl.clone();
      url.pathname = correctPath;
      return NextResponse.redirect(url);
    }

    // 잘못된 타입의 경로 접근 시 → 본인 타입 페이지로 리다이렉트
    if (userType && correctPath) {
      const isAccessingOtherUserPath = Object.entries(userTypeRoutes).some(
        ([type, route]) => type !== userType && pathname.startsWith(route)
      );

      if (isAccessingOtherUserPath) {
        const url = request.nextUrl.clone();
        url.pathname = correctPath;
        return NextResponse.redirect(url);
      }
    }

    // 프로필이 없는 경우 (회원가입 직후 프로필 생성 전) → 로그인 페이지로
    if (!profile && !isPublicPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
