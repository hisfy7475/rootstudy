import { createClient } from '@/lib/supabase/server';

/**
 * 최고 관리자(슈퍼 어드민) 권한 검증 공용 헬퍼.
 *
 * 서버 액션·서버 컴포넌트 어디서나 호출 가능. 성공 시 `userId` 반환, 실패 시
 * 사용자에게 표시 가능한 한글 에러 메시지를 함께 반환한다.
 *
 * 호출자는 다음 패턴으로 가드:
 *
 * ```ts
 * const auth = await requireSuperAdmin();
 * if (!auth.ok) return { error: auth.error };
 * ```
 *
 * 페이지 가드에서는 `redirect()` 와 결합. UI/탭/메뉴 분기는 별도 (이 헬퍼는 인증만).
 */
export async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, is_super_admin')
    .eq('id', user.id)
    .single();
  if (profile?.user_type !== 'admin' || !profile?.is_super_admin) {
    return { ok: false, error: '최고 관리자 권한이 필요합니다.' };
  }
  return { ok: true, userId: user.id };
}
