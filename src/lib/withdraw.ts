import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';

export type SoftDeleteResult = { success: true; warning?: string } | { error: string };

// 회원 soft delete 공통 처리.
//
// - profiles.withdrawn_at / withdrawn_by / withdrawn_reason 세팅
// - push_tokens 정리 (비활성 토큰 누적 방지)
// - Supabase Auth ban (876000h ≈ 100년, 사실상 영구)
//
// 권한 체크·자녀 연결 정리·revalidatePath 는 호출자가 담당한다.
// 어드민 강제 탈퇴와 셀프 탈퇴 모두에서 재사용.
export async function softDeleteUser(params: {
  userId: string;
  withdrawnBy: string;
  reason?: string | null;
}): Promise<SoftDeleteResult> {
  const { userId, withdrawnBy, reason } = params;
  const adminClient = createAdminClient();

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({
      withdrawn_at: new Date().toISOString(),
      withdrawn_by: withdrawnBy,
      withdrawn_reason: reason ?? null,
    })
    .eq('id', userId);

  if (updateError) {
    console.error('Error marking profile withdrawn:', updateError);
    return { error: '회원 탈퇴 처리에 실패했습니다.' };
  }

  // 학생인 경우 caps_id 점유 해제. UNIQUE 제약 때문에 탈퇴자가 점유하고 있으면
  // 다른 학생에게 같은 caps_id 부여 불가. 학생이 아니면 영향 없는 no-op 업데이트.
  await adminClient
    .from('student_profiles')
    .update({ caps_id: null, caps_id_set_at: null })
    .eq('id', userId);

  await adminClient.from('push_tokens').delete().eq('user_id', userId);

  const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  });

  if (authError) {
    console.error('Error banning auth user:', authError);
    return {
      success: true,
      warning: '계정 차단(Auth ban) 적용에 실패했습니다. 수동 확인이 필요합니다.',
    };
  }

  return { success: true };
}
