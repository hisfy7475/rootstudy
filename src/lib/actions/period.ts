'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getStudyDate, getStudyDayBounds, formatDate } from '@/lib/utils';

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
  archived_at: string | null;
  date_type?: {
    id: string;
    name: string;
    color: string;
  };
}

// 지점 및 날짜 타입별 교시 목록 조회
export async function getPeriodDefinitions(
  branchId: string,
  dateTypeId?: string,
): Promise<PeriodDefinition[]> {
  const supabase = await createClient();

  let query = supabase
    .from('period_definitions')
    .select(
      `
      *,
      date_type:date_type_id (
        id,
        name,
        color
      )
    `,
    )
    .eq('branch_id', branchId)
    .is('archived_at', null)
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
  name?: string,
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
  },
) {
  const supabase = await createClient();

  const { error } = await supabase.from('period_definitions').update(data).eq('id', id);

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

  const { error } = await supabase.from('period_definitions').delete().eq('id', id);

  if (error) {
    // 몰입도 기록(focus_scores) 등이 참조 중이면 물리 삭제가 FK(23503) 위반으로 막힌다.
    // 이 경우 과거 기록 보존을 위해 물리 삭제 대신 archived_at 으로 은퇴(보관) 처리한다.
    if (error.code === '23503') {
      const { error: archiveError } = await supabase
        .from('period_definitions')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);

      if (archiveError) {
        console.error('Error archiving period definition:', archiveError);
        return { error: '교시 삭제에 실패했습니다.' };
      }

      revalidatePath('/admin/periods');
      return { success: true };
    }

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
  time?: string, // HH:mm 형식, 없으면 현재 시간
): Promise<PeriodDefinition | null> {
  const supabase = await createClient();

  // 현재 시간 (HH:mm:ss 형식)
  const now = time ? `${time}:00` : new Date().toTimeString().split(' ')[0];

  const { data, error } = await supabase
    .from('period_definitions')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date_type_id', dateTypeId)
    .is('archived_at', null)
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
  }>,
) {
  const supabase = await createClient();

  const insertData = periods.map((p) => ({
    branch_id: branchId,
    date_type_id: dateTypeId,
    period_number: p.periodNumber,
    name: p.name || null,
    start_time: p.startTime,
    end_time: p.endTime,
  }));

  const { error } = await supabase.from('period_definitions').insert(insertData);

  if (error) {
    console.error('Error bulk creating period definitions:', error);
    return { error: '교시 일괄 생성에 실패했습니다.' };
  }

  revalidatePath('/admin/periods');
  return { success: true };
}

// 특정 날짜의 교시 목록 조회 (관리자용 - 날짜 타입 자동 감지).
// branchId === null 은 슈퍼관리자의 "전 지점" 신호 — 교시 정의는 지점별 고유라
// 단일 응답이 의미가 없어 빈 결과를 반환한다 (UI 측에서 지점 선택 후 재호출).
export async function getTodayPeriods(
  branchId: string | null,
  targetDate?: string,
): Promise<{
  periods: PeriodDefinition[];
  dateTypeName: string | null;
  dateTypeId: string | null;
}> {
  if (!branchId) return { periods: [], dateTypeName: null, dateTypeId: null };
  const supabase = await createClient();

  // 날짜 결정: 지정된 날짜 또는 오늘 (KST 기준)
  const today = targetDate || formatDate(getStudyDate());

  // 오늘의 날짜 타입 조회
  const { data: assignment, error: assignmentError } = await supabase
    .from('date_assignments')
    .select(
      `
      date_type_id,
      date_type:date_type_id (
        id,
        name
      )
    `,
    )
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

  // 해당 날짜 타입의 활성 교시 목록 조회 (은퇴 교시 제외)
  const { data: periods, error: periodsError } = await supabase
    .from('period_definitions')
    .select('*')
    .eq('branch_id', branchId)
    .eq('date_type_id', assignment.date_type_id)
    .is('archived_at', null)
    .order('period_number', { ascending: true });

  if (periodsError) {
    console.error('Error fetching periods:', periodsError);
    return {
      periods: [],
      dateTypeName: dateType?.name || null,
      dateTypeId: assignment.date_type_id,
    };
  }

  return {
    periods: periods || [],
    dateTypeName: dateType?.name || null,
    dateTypeId: assignment.date_type_id,
  };
}

// 몰입도 그리드용 교시 목록 조회.
// (그 날짜의 활성 교시) ∪ (그 날짜에 점수가 기록된 은퇴 교시) 를 병합해 반환한다.
// 은퇴(archived)된 교시라도 해당 날짜에 몰입도 점수가 있으면 "삭제됨" 열로 다시 보여주기 위함이다.
// 활성 교시만 필요한 출결 등은 기존 getTodayPeriods 를 그대로 사용한다.
export async function getFocusGridPeriods(
  branchId: string | null,
  targetDate?: string,
): Promise<{
  periods: PeriodDefinition[];
  dateTypeName: string | null;
  dateTypeId: string | null;
}> {
  // 활성 교시 + 날짜 타입 (기존 로직 재사용)
  const base = await getTodayPeriods(branchId, targetDate);
  if (!branchId || !base.dateTypeId) return base;

  const supabase = await createClient();

  // 그 날짜 학습일 범위에서 점수가 기록된 period_id 수집
  const studyDate = targetDate ? new Date(targetDate + 'T00:00:00.000Z') : getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: scoreRows } = await supabase
    .from('focus_scores')
    .select('period_id')
    .gte('recorded_at', start.toISOString())
    .lte('recorded_at', end.toISOString())
    .not('period_id', 'is', null);

  const scoredIds = new Set((scoreRows || []).map((r) => r.period_id as string));
  const activeIds = new Set(base.periods.map((p) => p.id));
  const missingIds = [...scoredIds].filter((id) => !activeIds.has(id));

  if (missingIds.length === 0) return base;

  // 활성 목록에 없는(=은퇴) 교시를 id로 직접 조회. 같은 지점/날짜 타입으로 한정해
  // 다른 지점의 교시가 열로 섞이지 않게 한다 (archived 포함).
  const { data: archived } = await supabase
    .from('period_definitions')
    .select('*')
    .in('id', missingIds)
    .eq('branch_id', branchId)
    .eq('date_type_id', base.dateTypeId);

  if (!archived || archived.length === 0) return base;

  const merged = [...base.periods, ...archived].sort((a, b) => a.period_number - b.period_number);

  return { ...base, periods: merged };
}

// 날짜 타입별 교시 복사 (다른 지점으로도 복사 가능)
export async function copyPeriodsToDateType(
  sourceBranchId: string,
  sourceDateTypeId: string,
  targetBranchId: string,
  targetDateTypeId: string,
) {
  const supabase = await createClient();

  // 원본 활성 교시 조회 (은퇴 교시는 복사 제외)
  const { data: sourcePeriods, error: fetchError } = await supabase
    .from('period_definitions')
    .select('*')
    .eq('branch_id', sourceBranchId)
    .eq('date_type_id', sourceDateTypeId)
    .is('archived_at', null);

  if (fetchError || !sourcePeriods || sourcePeriods.length === 0) {
    return { error: '복사할 교시가 없습니다.' };
  }

  // 대상 지점/날짜 타입에 복사
  const insertData = sourcePeriods.map((p) => ({
    branch_id: targetBranchId,
    date_type_id: targetDateTypeId,
    period_number: p.period_number,
    name: p.name,
    start_time: p.start_time,
    end_time: p.end_time,
  }));

  const { error: insertError } = await supabase.from('period_definitions').insert(insertData);

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
