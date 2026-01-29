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
}

// 전체 지점 목록 조회
export async function getAllBranches(includeInactive: boolean = false): Promise<Branch[]> {
  const supabase = await createClient();

  let query = supabase
    .from('branches')
    .select('*')
    .order('created_at', { ascending: true });

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

// 지점 추가
export async function createBranch(name: string, address?: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('branches')
    .insert({
      name,
      address: address || null,
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
