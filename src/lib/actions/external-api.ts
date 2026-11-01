'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { generateApiKey, type NameDisplay } from '@/lib/external-api';

// ============================================
// 외부 연동 API 인증키 — 최고 관리자 전용
// (테이블은 RLS 정책 0 이라 서비스 롤로만 다룬다)
// ============================================

export interface ExternalApiKey {
  id: string;
  name: string;
  branch_id: string;
  branch_name: string | null;
  key_prefix: string;
  name_display: NameDisplay;
  rate_limit_per_minute: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export async function getExternalApiKeys(): Promise<ExternalApiKey[]> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return [];

  const { data, error } = await createAdminClient()
    .from('external_api_keys')
    .select(
      'id, name, branch_id, key_prefix, name_display, rate_limit_per_minute, created_at, last_used_at, revoked_at, branches ( name )',
    )
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching external api keys:', error);
    return [];
  }
  return (data ?? []).map((k) => {
    const b = Array.isArray(k.branches) ? k.branches[0] : k.branches;
    return { ...k, branch_name: b?.name ?? null } as ExternalApiKey;
  });
}

/** 키 발급. 원문(key)은 이 응답에서만 돌려준다 — DB 에는 해시만 남는다. */
export async function createExternalApiKey(input: {
  name: string;
  branchId: string;
  nameDisplay: NameDisplay;
}): Promise<{ success: true; key: string } | { success: false; error: string }> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { success: false, error: '업체명을 입력해 주세요.' };
  if (!input.branchId) return { success: false, error: '지점을 선택해 주세요.' };

  const { key, hash, prefix } = generateApiKey();
  const { error } = await createAdminClient().from('external_api_keys').insert({
    name,
    branch_id: input.branchId,
    name_display: input.nameDisplay,
    key_prefix: prefix,
    key_hash: hash,
    created_by: auth.userId,
  });
  if (error) {
    console.error('Error creating external api key:', error);
    return { success: false, error: '인증키 발급에 실패했습니다.' };
  }
  revalidatePath('/admin/external-api');
  return { success: true, key };
}

/** 이름 표시 방식 변경 — 클라이언트 결정(실명/가림)에 따라 키를 다시 발급하지 않고 바꾼다. */
export async function updateExternalApiKeyNameDisplay(
  id: string,
  nameDisplay: NameDisplay,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await createAdminClient()
    .from('external_api_keys')
    .update({ name_display: nameDisplay })
    .eq('id', id);
  if (error) return { success: false, error: '변경에 실패했습니다.' };
  revalidatePath('/admin/external-api');
  return { success: true };
}

/** 폐기 — 즉시 해당 키의 모든 호출이 401 이 된다. 되돌릴 수 없으므로 새로 발급해야 한다. */
export async function revokeExternalApiKey(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await createAdminClient()
    .from('external_api_keys')
    .update({ revoked_at: new Date().toISOString(), revoked_by: auth.userId })
    .eq('id', id)
    .is('revoked_at', null);
  if (error) return { success: false, error: '폐기에 실패했습니다.' };
  revalidatePath('/admin/external-api');
  return { success: true };
}
