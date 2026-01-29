'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================
// 교시(Period) 관련
// ============================================

export interface PeriodDefinition {
  id: string;
  branch_id: string;
  date_type_id: string;
  period_number: number;
  name: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
  date_type?: {
    id: string;
    name: string;
    color: string;
  };
}

// 지점 및 날짜 타입별 교시 목록 조회
export async function getPeriodDefinitions(
  branchId: string,
  dateTypeId?: string
): Promise<PeriodDefinition[]> {
  const supabase = await createClient();

  let query = supabase
    .from('period_definitions')
    .select(`
      *,
      date_type:date_type_id (
        id,
        name,
        color
      )
    `)
    .eq('branch_id', branchId)
    .order('period_number', { ascending: true });

  if (dateTypeId) {
    query = query.eq('date_type_id', dateTypeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching period definitions:', error);
    return [];
  }

  return data || [];
}

// 교시 생성
export async function createPeriodDefinition(
  branchId: string,
  dateTypeId: string,
  periodNumber: number,
  startTime: string,
  endTime: string,
  name?: string
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('period_definitions')
    .insert({
      branch_id: branchId,
      date_type_id: dateTypeId,
      period_number: periodNumber,
      start_time: startTime,
      end_time: endTime,
      name: name || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating period definition:', error);
    if (error.code === '23505') {
      return { error: '이미 해당 교시 번호가 존재합니다.' };
    }
    return { error: '교시 생성에 실패했습니다.' };
  }

  revalidatePath('/admin/periods');
  return { success: true, data };
}

// 교시 수정
export async function updatePeriodDefinition(
  id: string,
  data: {
    period_number?: number;
    name?: string | null;
    start_time?: string;
    end_time?: string;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('period_definitions')
    .update(data)
    .eq('id', id);

  if (error) {
    console.error('Error updating period definition:', error);
    if (error.code === '23505') {
      return { error: '이미 해당 교시 번호가 존재합니다.' };
    }
    return { error: '교시 수정에 실패했습니다.' };
  }

  revalidatePath('/admin/periods');
  return { success: true };
}

// 교시 삭제
export async function deletePeriodDefinition(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('period_definitions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting period definition:', error);
    return { error: '교시 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/periods');
  return { success: true };
}

// 현재 교시 조회 (특정 시간에 어떤 교시인지)
export async function getCurrentPeriod(
  branchId: string,
  dateTypeId: string,
  time?: string // HH:mm 형식, 없으면 현재 시간
): Promise<PeriodDefinition | null> {
  const supabase = await createClient();

  // 현재 시간 (HH:mm:ss 형식)
  const now = time 
    ? `${time}:00` 
    : new Date().toTimeString().split(' ')[0];

  const { data, error } = await supabase
    .from('period_definitions')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date_type_id', dateTypeId)
    .lte('start_time', now)
    .gte('end_time', now)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching current period:', error);
  }

  return data || null;
}

// 교시 일괄 생성 (여러 교시 한번에)
export async function bulkCreatePeriodDefinitions(
  branchId: string,
  dateTypeId: string,
  periods: Array<{
    periodNumber: number;
    name?: string;
    startTime: string;
    endTime: string;
  }>
) {
  const supabase = await createClient();

  const insertData = periods.map(p => ({
    branch_id: branchId,
    date_type_id: dateTypeId,
    period_number: p.periodNumber,
    name: p.name || null,
    start_time: p.startTime,
    end_time: p.endTime,
  }));

  const { error } = await supabase
    .from('period_definitions')
    .insert(insertData);

  if (error) {
    console.error('Error bulk creating period definitions:', error);
    return { error: '교시 일괄 생성에 실패했습니다.' };
  }

  revalidatePath('/admin/periods');
  return { success: true };
}

// 오늘 날짜의 교시 목록 조회 (관리자용 - 날짜 타입 자동 감지)
export async function getTodayPeriods(branchId: string): Promise<{
  periods: PeriodDefinition[];
  dateTypeName: string | null;
  dateTypeId: string | null;
}> {
  const supabase = await createClient();

  // 오늘 날짜 (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];

  // 오늘의 날짜 타입 조회
  const { data: assignment, error: assignmentError } = await supabase
    .from('date_assignments')
    .select(`
      date_type_id,
      date_type:date_type_id (
        id,
        name
      )
    `)
    .eq('branch_id', branchId)
    .eq('date', today)
    .single();

  if (assignmentError && assignmentError.code !== 'PGRST116') {
    console.error('Error fetching date assignment:', assignmentError);
  }

  // 날짜 타입이 지정되지 않은 경우
  if (!assignment || !assignment.date_type_id) {
    return { periods: [], dateTypeName: null, dateTypeId: null };
  }

  const dateType = assignment.date_type as unknown as { id: string; name: string };

  // 해당 날짜 타입의 교시 목록 조회
  const { data: periods, error: periodsError } = await supabase
    .from('period_definitions')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date_type_id', assignment.date_type_id)
    .order('period_number', { ascending: true });

  if (periodsError) {
    console.error('Error fetching periods:', periodsError);
    return { periods: [], dateTypeName: dateType?.name || null, dateTypeId: assignment.date_type_id };
  }

  return {
    periods: periods || [],
    dateTypeName: dateType?.name || null,
    dateTypeId: assignment.date_type_id,
  };
}

// 날짜 타입별 교시 복사
export async function copyPeriodsToDateType(
  branchId: string,
  sourceDateTypeId: string,
  targetDateTypeId: string
) {
  const supabase = await createClient();

  // 원본 교시 조회
  const { data: sourcePeriods, error: fetchError } = await supabase
    .from('period_definitions')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date_type_id', sourceDateTypeId);

  if (fetchError || !sourcePeriods || sourcePeriods.length === 0) {
    return { error: '복사할 교시가 없습니다.' };
  }

  // 대상 날짜 타입에 복사
  const insertData = sourcePeriods.map(p => ({
    branch_id: branchId,
    date_type_id: targetDateTypeId,
    period_number: p.period_number,
    name: p.name,
    start_time: p.start_time,
    end_time: p.end_time,
  }));

  const { error: insertError } = await supabase
    .from('period_definitions')
    .insert(insertData);

  if (insertError) {
    console.error('Error copying periods:', insertError);
    if (insertError.code === '23505') {
      return { error: '대상 날짜 타입에 이미 교시가 존재합니다.' };
    }
    return { error: '교시 복사에 실패했습니다.' };
  }

  revalidatePath('/admin/periods');
  return { success: true, count: sourcePeriods.length };
}
