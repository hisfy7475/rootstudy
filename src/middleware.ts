import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // NICEPay 콜백 / 웹훅 — 세션을 건드리지 않고 통과.
  // PC 결제에서 부모창의 form.submit()이 여기로 top-level POST를 보내는데,
  // 이때 getUser()로 access_token 을 갱신하면 refresh_token 이 소비되고,
  // route handler 가 반환하는 새 NextResponse 에는 갱신된 Set-Cookie 가 병합되지 않아
  // 이후 /student/meals/pay/result GET 에서 세션이 만료 상태가 되어 /login 으로 튕긴다.
  if (pathname.startsWith('/api/payments')) {
    return NextResponse.next({ request });
  }

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
          // 자동로그인 유지 옵션. wstudy_remember=0 이면 Supabase 쿠키를 세션쿠키로
          // 발급해 브라우저 종료 시 만료시킨다. 토큰 갱신 시점마다 본 분기가 다시
          // 동작하므로 미들웨어가 영속성 일관성의 핵심 지점이다.
          // 보안 옵션(httpOnly/secure/sameSite/path/domain)은 반드시 보존.
          const remember = request.cookies.get('wstudy_remember')?.value !== '0';
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            if (remember) {
              supabaseResponse.cookies.set(name, value, options);
            } else {
              // 세션쿠키로 발급. 보안 옵션은 보존하고 maxAge/expires만 제거.
              const rest = { ...(options ?? {}) };
              delete (rest as { maxAge?: number }).maxAge;
              delete (rest as { expires?: Date }).expires;
              supabaseResponse.cookies.set(name, value, rest);
            }
          });
        },
      },
    },
  );

  // 사용자 세션 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 푸시 토큰 API — 세션 쿠키만 갱신하고 리다이렉트하지 않음 (공개 경로로 두면 로그인 사용자가 오히려 홈으로 보내짐)
  if (pathname.startsWith('/api/push')) {
    return supabaseResponse;
  }

  // 인증이 필요없는 경로
  const publicPaths = ['/login', '/signup', '/forgot-password', '/api/cron', '/account/withdrawn'];
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type, is_approved, withdrawn_at')
      .eq('id', user.id)
      .single();

    const userType = profile?.user_type as string | undefined;
    const isApproved = profile?.is_approved as boolean | undefined;
    const withdrawnAt = profile?.withdrawn_at as string | null | undefined;
    const correctPath = userType ? userTypeRoutes[userType] : null;

    // 퇴원 처리된 회원은 안내 페이지로만 접근 가능.
    // /api/* 호출은 fetch 응답이 HTML 로 바뀌면 클라이언트가 깨지므로 401 JSON 으로 차단.
    // (/api/payments, /api/push, /api/cron 은 위 분기에서 이미 별도 처리되어 여기 도달하지 않음.)
    if (withdrawnAt) {
      if (pathname.startsWith('/api/')) {
        return new NextResponse(JSON.stringify({ error: 'account_withdrawn' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (pathname !== '/account/withdrawn') {
        const url = request.nextUrl.clone();
        url.pathname = '/account/withdrawn';
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // 미승인 학생 처리
    if (userType === 'student' && isApproved === false) {
      // 미승인 학생은 /student/pending만 접근 가능
      if (pathname !== '/student/pending') {
        const url = request.nextUrl.clone();
        url.pathname = '/student/pending';
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // 승인된 학생이 /student/pending 접근 시 → /student로 리다이렉트
    if (userType === 'student' && isApproved === true && pathname === '/student/pending') {
      const url = request.nextUrl.clone();
      url.pathname = '/student';
      return NextResponse.redirect(url);
    }

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
        ([type, route]) => type !== userType && pathname.startsWith(route),
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
