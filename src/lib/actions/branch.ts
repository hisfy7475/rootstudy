'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================
// 지점(Branch) 관련
// ============================================

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  display_order: number;
}

// 전체 지점 목록 조회 (display_order 순으로 정렬)
export async function getAllBranches(includeInactive: boolean = false): Promise<Branch[]> {
  const supabase = await createClient();

  let query = supabase
    .from('branches')
    .select('*')
    .order('display_order', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching branches:', error);
    return [];
  }

  return data || [];
}

// 지점 추가 (맨 마지막 순서로)
export async function createBranch(name: string, address?: string) {
  const supabase = await createClient();

  // 현재 최대 display_order 조회
  const { data: maxOrderData } = await supabase
    .from('branches')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxOrderData?.display_order || 0) + 1;

  const { data, error } = await supabase
    .from('branches')
    .insert({
      name,
      address: address || null,
      display_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating branch:', error);
    return { error: '지점 추가에 실패했습니다.' };
  }

  revalidatePath('/admin/branches');
  return { success: true, data };
}

// 지점 수정
export async function updateBranch(id: string, data: { name?: string; address?: string; is_active?: boolean }) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('branches')
    .update(data)
    .eq('id', id);

  if (error) {
    console.error('Error updating branch:', error);
    return { error: '지점 수정에 실패했습니다.' };
  }

  revalidatePath('/admin/branches');
  return { success: true };
}

// 지점 삭제 (비활성화)
export async function deactivateBranch(id: string) {
  return updateBranch(id, { is_active: false });
}

// 지점 활성화
export async function activateBranch(id: string) {
  return updateBranch(id, { is_active: true });
}

// 지점 순서 위로 이동
export async function moveBranchUp(id: string) {
  const supabase = await createClient();

  // 현재 지점 정보 가져오기
  const { data: currentBranch, error: fetchError } = await supabase
    .from('branches')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !currentBranch) {
    return { error: '지점을 찾을 수 없습니다.' };
  }

  // 바로 위 지점 찾기 (display_order가 더 작은 것 중 가장 큰 것)
  const { data: upperBranch } = await supabase
    .from('branches')
    .select('*')
    .lt('display_order', currentBranch.display_order)
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  if (!upperBranch) {
    // 이미 맨 위에 있음
    return { success: true };
  }

  // 두 지점의 순서 교환
  const { error: updateError1 } = await supabase
    .from('branches')
    .update({ display_order: upperBranch.display_order })
    .eq('id', currentBranch.id);

  const { error: updateError2 } = await supabase
    .from('branches')
    .update({ display_order: currentBranch.display_order })
    .eq('id', upperBranch.id);

  if (updateError1 || updateError2) {
    console.error('Error moving branch up:', updateError1 || updateError2);
    return { error: '순서 변경에 실패했습니다.' };
  }

  revalidatePath('/admin/branches');
  return { success: true };
}

// 지점 순서 아래로 이동
export async function moveBranchDown(id: string) {
  const supabase = await createClient();

  // 현재 지점 정보 가져오기
  const { data: currentBranch, error: fetchError } = await supabase
    .from('branches')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !currentBranch) {
    return { error: '지점을 찾을 수 없습니다.' };
  }

  // 바로 아래 지점 찾기 (display_order가 더 큰 것 중 가장 작은 것)
  const { data: lowerBranch } = await supabase
    .from('branches')
    .select('*')
    .gt('display_order', currentBranch.display_order)
    .order('display_order', { ascending: true })
    .limit(1)
    .single();

  if (!lowerBranch) {
    // 이미 맨 아래에 있음
    return { success: true };
  }

  // 두 지점의 순서 교환
  const { error: updateError1 } = await supabase
    .from('branches')
    .update({ display_order: lowerBranch.display_order })
    .eq('id', currentBranch.id);

  const { error: updateError2 } = await supabase
    .from('branches')
    .update({ display_order: currentBranch.display_order })
    .eq('id', lowerBranch.id);

  if (updateError1 || updateError2) {
    console.error('Error moving branch down:', updateError1 || updateError2);
    return { error: '순서 변경에 실패했습니다.' };
  }

  revalidatePath('/admin/branches');
  return { success: true };
}

// 지점별 학생 수 조회
export async function getBranchStudentCounts(): Promise<{ branchId: string; count: number }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('user_type', 'student')
    .not('branch_id', 'is', null);

  if (error) {
    console.error('Error fetching branch student counts:', error);
    return [];
  }

  // 지점별 카운트 집계
  const counts: { [key: string]: number } = {};
  (data || []).forEach(p => {
    if (p.branch_id) {
      counts[p.branch_id] = (counts[p.branch_id] || 0) + 1;
    }
  });

  return Object.entries(counts).map(([branchId, count]) => ({
    branchId,
    count,
  }));
}
