'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================
// 날짜 타입 관련
// ============================================

export interface DateTypeDefinition {
  id: string;
  branch_id: string;
  name: string;
  default_start_time: string;
  default_end_time: string;
  color: string;
  created_at: string;
}

export interface DateAssignment {
  id: string;
  branch_id: string;
  date: string;
  date_type_id: string;
  custom_start_time: string | null;
  custom_end_time: string | null;
  note: string | null;
  created_at: string;
  date_type?: DateTypeDefinition;
}

// 지점별 날짜 타입 정의 조회
export async function getDateTypeDefinitions(branchId: string): Promise<DateTypeDefinition[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('date_type_definitions')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching date type definitions:', error);
    return [];
  }

  return data || [];
}

// 날짜 타입 정의 생성
export async function createDateTypeDefinition(
  branchId: string,
  name: string,
  defaultStartTime: string,
  defaultEndTime: string,
  color?: string
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('date_type_definitions')
    .insert({
      branch_id: branchId,
      name,
      default_start_time: defaultStartTime,
      default_end_time: defaultEndTime,
      color: color || '#7C9FF5',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating date type definition:', error);
    return { error: '날짜 타입 생성에 실패했습니다.' };
  }

  revalidatePath('/admin/date-types');
  return { success: true, data };
}

// 날짜 타입 정의 수정
export async function updateDateTypeDefinition(
  id: string,
  data: {
    name?: string;
    default_start_time?: string;
    default_end_time?: string;
    color?: string;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('date_type_definitions')
    .update(data)
    .eq('id', id);

  if (error) {
    console.error('Error updating date type definition:', error);
    return { error: '날짜 타입 수정에 실패했습니다.' };
  }

  revalidatePath('/admin/date-types');
  return { success: true };
}

// 날짜 타입 정의 삭제
export async function deleteDateTypeDefinition(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('date_type_definitions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting date type definition:', error);
    return { error: '날짜 타입 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/date-types');
  return { success: true };
}

// 날짜별 타입 지정 조회 (기간)
export async function getDateAssignments(
  branchId: string,
  startDate: string,
  endDate: string
): Promise<DateAssignment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('date_assignments')
    .select(`
      *,
      date_type:date_type_id (*)
    `)
    .eq('branch_id', branchId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching date assignments:', error);
    return [];
  }

  return data || [];
}

// 특정 날짜의 타입 조회
export async function getDateAssignment(branchId: string, date: string): Promise<DateAssignment | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('date_assignments')
    .select(`
      *,
      date_type:date_type_id (*)
    `)
    .eq('branch_id', branchId)
    .eq('date', date)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching date assignment:', error);
  }

  return data || null;
}

// 날짜 타입 지정 (upsert)
export async function setDateAssignment(
  branchId: string,
  date: string,
  dateTypeId: string,
  customStartTime?: string,
  customEndTime?: string,
  note?: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('date_assignments')
    .upsert({
      branch_id: branchId,
      date,
      date_type_id: dateTypeId,
      custom_start_time: customStartTime || null,
      custom_end_time: customEndTime || null,
      note: note || null,
    }, {
      onConflict: 'branch_id,date',
    });

  if (error) {
    console.error('Error setting date assignment:', error);
    return { error: '날짜 타입 지정에 실패했습니다.' };
  }

  revalidatePath('/admin/date-types');
  return { success: true };
}

// 날짜 타입 지정 삭제
export async function deleteDateAssignment(branchId: string, date: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('date_assignments')
    .delete()
    .eq('branch_id', branchId)
    .eq('date', date);

  if (error) {
    console.error('Error deleting date assignment:', error);
    return { error: '날짜 타입 지정 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/date-types');
  return { success: true };
}

// 특정 날짜의 의무 시간 조회
// custom 시간이 설정되어 있으면 사용, 없으면 date_type의 default 사용
export async function getMandatoryTime(branchId: string, date: string): Promise<{
  startTime: string | null;
  endTime: string | null;
  dateTypeName: string | null;
}> {
  const supabase = await createClient();

  const { data: assignment, error } = await supabase
    .from('date_assignments')
    .select(`
      custom_start_time,
      custom_end_time,
      date_type:date_type_id (
        name,
        default_start_time,
        default_end_time
      )
    `)
    .eq('branch_id', branchId)
    .eq('date', date)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching mandatory time:', error);
  }

  // 해당 날짜에 타입 지정이 없으면 null 반환
  if (!assignment || !assignment.date_type) {
    return { startTime: null, endTime: null, dateTypeName: null };
  }

  const dateType = assignment.date_type as unknown as {
    name: string;
    default_start_time: string;
    default_end_time: string;
  };

  // custom 시간이 있으면 사용, 없으면 default 사용
  const startTime = assignment.custom_start_time || dateType.default_start_time;
  const endTime = assignment.custom_end_time || dateType.default_end_time;

  return {
    startTime,
    endTime,
    dateTypeName: dateType.name,
  };
}

// 날짜 범위에 타입 일괄 지정
export async function bulkSetDateAssignments(
  branchId: string,
  startDate: string,
  endDate: string,
  dateTypeId: string,
  daysOfWeek?: number[] // 0=일, 1=월, ..., 6=토 (미지정시 모든 요일)
) {
  const supabase = await createClient();

  const start = new Date(startDate);
  const end = new Date(endDate);
  const assignments: { branch_id: string; date: string; date_type_id: string }[] = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    
    // 요일 필터가 있으면 해당 요일만
    if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(dayOfWeek)) {
      continue;
    }

    assignments.push({
      branch_id: branchId,
      date: d.toISOString().split('T')[0],
      date_type_id: dateTypeId,
    });
  }

  if (assignments.length === 0) {
    return { success: true, count: 0 };
  }

  const { error } = await supabase
    .from('date_assignments')
    .upsert(assignments, {
      onConflict: 'branch_id,date',
    });

  if (error) {
    console.error('Error bulk setting date assignments:', error);
    return { error: '날짜 타입 일괄 지정에 실패했습니다.' };
  }

  revalidatePath('/admin/date-types');
  return { success: true, count: assignments.length };
}
