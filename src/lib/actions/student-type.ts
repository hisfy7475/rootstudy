'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  StudentType,
  StudentTypeSubject,
  WeeklyGoalSetting,
  DateTypeDefinition,
} from '@/types/database';

// 주간 목표 설정 타입
export interface WeeklyGoalSettingWithDateType extends WeeklyGoalSetting {
  date_type?: DateTypeDefinition;
}

// 학생 타입 목록 조회 (지점 무관, 전체 조회)
export async function getStudentTypes(): Promise<StudentType[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.from('student_types').select('*').order('name');

  if (error) {
    console.error('Error fetching student types:', error);
    return [];
  }

  return data || [];
}

// 학생 타입 상세 조회
export async function getStudentType(id: string): Promise<StudentType | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from('student_types').select('*').eq('id', id).single();

  if (error) {
    console.error('Error fetching student type:', error);
    return null;
  }

  return data;
}

// 학생 타입 생성 + 모든 date_type 에 weekly_goal_settings 기본값 자동 seed
//
// weekly_goal_settings 가 SSOT 이므로, 신규 타입을 만들 때 모든 date_type 에 기본값 row 가 없으면
// 학생 화면/리포트에서 fallback (student_types.weekly_goal_hours / 가중평균) 경로로만 동작해
// 운영자가 학기중/방학별 목표를 설정해야 한다는 사실을 놓치기 쉽다.
// 신규 타입 생성 시점에 weekly_goal_hours 값으로 모든 date_type row 를 미리 채워 둔다.
export async function createStudentType(data: {
  name: string;
  weekly_goal_hours: number;
}): Promise<{ success: boolean; data?: StudentType; error?: string }> {
  const supabase = await createClient();

  const { data: newType, error } = await supabase
    .from('student_types')
    .insert({
      name: data.name,
      weekly_goal_hours: data.weekly_goal_hours,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating student type:', error);
    return { success: false, error: error.message };
  }

  // 모든 date_type 에 기본 seed row 생성 (운영자가 학기/방학별 세부값을 곧바로 편집 가능)
  const { data: dateTypes } = await supabase.from('date_type_definitions').select('id');
  if (dateTypes && dateTypes.length > 0) {
    const seedRows = dateTypes.map((dt) => ({
      student_type_id: newType.id,
      date_type_id: dt.id,
      weekly_goal_hours: data.weekly_goal_hours,
      reward_points: 0,
      penalty_points: 0,
      minimum_hours: 0,
      minimum_penalty_points: 0,
    }));
    const { error: seedError } = await supabase
      .from('weekly_goal_settings')
      .upsert(seedRows, { onConflict: 'student_type_id,date_type_id' });
    if (seedError) {
      console.error('Error seeding weekly_goal_settings:', seedError);
      // seed 실패는 fatal 이 아님 (타입은 이미 생성됨, fallback 경로로 동작)
    }
  }

  revalidatePath('/admin/student-types');
  return { success: true, data: newType };
}

// 학생 타입 수정
export async function updateStudentType(
  id: string,
  data: {
    name?: string;
    weekly_goal_hours?: number;
  },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from('student_types').update(data).eq('id', id);

  if (error) {
    console.error('Error updating student type:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/student-types');
  return { success: true };
}

// 학생 타입 삭제
export async function deleteStudentType(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from('student_types').delete().eq('id', id);

  if (error) {
    console.error('Error deleting student type:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/student-types');
  return { success: true };
}

// 타입별 과목 목록 조회 (sort_order 순)
export async function getStudentTypeSubjects(studentTypeId: string): Promise<StudentTypeSubject[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('student_type_subjects')
    .select('*')
    .eq('student_type_id', studentTypeId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching student type subjects:', error);
    return [];
  }

  return data || [];
}

// 타입별 과목 설정 (기존 과목 삭제 후 새로 등록, sort_order 포함)
export async function setStudentTypeSubjects(
  studentTypeId: string,
  subjects: string[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // 기존 과목 삭제
  const { error: deleteError } = await supabase
    .from('student_type_subjects')
    .delete()
    .eq('student_type_id', studentTypeId);

  if (deleteError) {
    console.error('Error deleting existing subjects:', deleteError);
    return { success: false, error: deleteError.message };
  }

  // 새 과목 추가 (순서 포함)
  if (subjects.length > 0) {
    const insertData = subjects.map((subject, index) => ({
      student_type_id: studentTypeId,
      subject_name: subject,
      sort_order: index + 1,
    }));

    const { error: insertError } = await supabase.from('student_type_subjects').insert(insertData);

    if (insertError) {
      console.error('Error inserting subjects:', insertError);
      return { success: false, error: insertError.message };
    }
  }

  revalidatePath('/admin/student-types');
  return { success: true };
}

// 다수 학생의 타입별 과목을 한 번에 조회 (N+1 해소).
// 반환: { [studentId]: string[] }
export async function getSubjectsForStudents(
  studentIds: string[],
): Promise<Record<string, string[]>> {
  if (studentIds.length === 0) return {};
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from('student_profiles')
    .select('id, student_type_id')
    .in('id', studentIds);

  const studentTypeMap = new Map<string, string | null>();
  const typeIds = new Set<string>();
  for (const p of profiles ?? []) {
    studentTypeMap.set(p.id as string, (p.student_type_id as string | null) ?? null);
    if (p.student_type_id) typeIds.add(p.student_type_id as string);
  }

  if (typeIds.size === 0) {
    const out: Record<string, string[]> = {};
    for (const id of studentIds) out[id] = [];
    return out;
  }

  const { data: subjectRows } = await supabase
    .from('student_type_subjects')
    .select('student_type_id, subject_name, sort_order')
    .in('student_type_id', Array.from(typeIds))
    .order('sort_order', { ascending: true });

  const subjectsByType: Record<string, string[]> = {};
  for (const r of subjectRows ?? []) {
    const tid = r.student_type_id as string;
    if (!subjectsByType[tid]) subjectsByType[tid] = [];
    subjectsByType[tid].push(r.subject_name as string);
  }

  const result: Record<string, string[]> = {};
  for (const id of studentIds) {
    const tid = studentTypeMap.get(id);
    result[id] = tid ? (subjectsByType[tid] ?? []) : [];
  }
  return result;
}

// 학생의 타입에 해당하는 과목 목록 조회 (sort_order 순). 단일 호출 — 가능하면 getSubjectsForStudents 사용.
export async function getSubjectsForStudent(studentId: string): Promise<string[]> {
  const supabase = await createClient();

  // 학생의 타입 조회
  const { data: studentProfile, error: profileError } = await supabase
    .from('student_profiles')
    .select('student_type_id')
    .eq('id', studentId)
    .single();

  if (profileError || !studentProfile?.student_type_id) {
    // 타입이 없으면 기본 과목 목록 반환
    return [];
  }

  // 타입별 과목 조회 (sort_order 순)
  const { data: subjects, error: subjectsError } = await supabase
    .from('student_type_subjects')
    .select('subject_name')
    .eq('student_type_id', studentProfile.student_type_id)
    .order('sort_order', { ascending: true });

  if (subjectsError) {
    console.error('Error fetching subjects for student:', subjectsError);
    return [];
  }

  return subjects?.map((s) => s.subject_name) || [];
}

// 학생의 타입 변경 (학생 프로필의 student_type_id 업데이트)
export async function assignStudentType(
  studentId: string,
  studentTypeId: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('student_profiles')
    .update({ student_type_id: studentTypeId })
    .eq('id', studentId);

  if (error) {
    console.error('Error assigning student type:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/members');
  return { success: true };
}

// 타입별 학생 수 조회 (branchId 지정 시 해당 지점만)
export async function getStudentTypeStudentCounts(
  branchId?: string | null,
): Promise<Record<string, number>> {
  const supabase = await createClient();

  let studentIds: string[] | null = null;
  if (branchId) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('branch_id', branchId)
      .eq('user_type', 'student');
    if (profileError) {
      console.error('Error fetching branch profiles:', profileError);
      return {};
    }
    studentIds = (profileRows || []).map((r) => r.id);
    if (studentIds.length === 0) return {};
  }

  let query = supabase.from('student_profiles').select('student_type_id');
  if (studentIds) {
    query = query.in('id', studentIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching student counts:', error);
    return {};
  }

  const counts: Record<string, number> = {};
  data?.forEach((student) => {
    const typeId = student.student_type_id || 'unassigned';
    counts[typeId] = (counts[typeId] || 0) + 1;
  });

  return counts;
}

// ============================================
// 주간 목표 설정 관련 함수
// ============================================

// 학생 타입의 주간 목표 설정 목록 조회
export async function getWeeklyGoalSettings(
  studentTypeId: string,
): Promise<WeeklyGoalSettingWithDateType[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('weekly_goal_settings')
    .select(
      `
      *,
      date_type:date_type_definitions(*)
    `,
    )
    .eq('student_type_id', studentTypeId);

  if (error) {
    console.error('Error fetching weekly goal settings:', error);
    return [];
  }

  return data || [];
}

// 지점에 해당하는 날짜 타입 목록 조회
export async function getDateTypesForBranch(branchId: string): Promise<DateTypeDefinition[]> {
  const supabase = await createClient();

  const { data: dateTypes, error: dateError } = await supabase
    .from('date_type_definitions')
    .select('*')
    .eq('branch_id', branchId)
    .order('name');

  if (dateError) {
    console.error('Error fetching date types:', dateError);
    return [];
  }

  return dateTypes || [];
}

// 주간 목표 설정 저장 (upsert)
export async function saveWeeklyGoalSetting(data: {
  student_type_id: string;
  date_type_id: string;
  weekly_goal_hours: number;
  reward_points: number;
  penalty_points: number;
  minimum_hours: number;
  minimum_penalty_points: number;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from('weekly_goal_settings').upsert(
    {
      student_type_id: data.student_type_id,
      date_type_id: data.date_type_id,
      weekly_goal_hours: data.weekly_goal_hours,
      reward_points: data.reward_points,
      penalty_points: data.penalty_points,
      minimum_hours: data.minimum_hours,
      minimum_penalty_points: data.minimum_penalty_points,
    },
    {
      onConflict: 'student_type_id,date_type_id',
    },
  );

  if (error) {
    console.error('Error saving weekly goal setting:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/student-types');
  return { success: true };
}

// 주간 목표 설정 일괄 저장
//
// delete+insert 패턴은 (1) 부분 실패 시 데이터 손실, (2) 동시 호출 시 (student_type, date_type)
// 중복 row 생성 위험이 있다. UNIQUE (student_type_id, date_type_id) 제약 + upsert 로 대체.
//
// 중요: prune (제거된 date_type 정리) 범위는 반드시 `inScopeDateTypeIds` 로 제한해야 한다.
//   date_type_definitions 는 지점별로 분리되지만 weekly_goal_settings 는 (student_type, date_type)
//   복합키만 가져, 슈퍼관리자가 한 지점 모달을 저장하면 student_type 단위로 prune 했을 때
//   다른 지점의 row 도 함께 삭제되는 데이터 손실이 발생한다. 호출자가 "이번 저장에서 다룬
//   date_type 의 전체 집합" 을 inScopeDateTypeIds 로 넘겨야 한다.
export async function saveWeeklyGoalSettingsBatch(
  studentTypeId: string,
  settings: Array<{
    date_type_id: string;
    weekly_goal_hours: number;
    reward_points: number;
    penalty_points: number;
    minimum_hours: number;
    minimum_penalty_points: number;
  }>,
  /** prune 대상 date_type 의 전체 집합 (보통 모달이 로드한 한 지점의 date_type id 목록).
   *  생략 시 prune 을 비활성화 (안전 기본값). */
  inScopeDateTypeIds?: string[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  if (settings.length > 0) {
    const upsertData = settings.map((s) => ({
      student_type_id: studentTypeId,
      date_type_id: s.date_type_id,
      weekly_goal_hours: s.weekly_goal_hours,
      reward_points: s.reward_points,
      penalty_points: s.penalty_points,
      minimum_hours: s.minimum_hours,
      minimum_penalty_points: s.minimum_penalty_points,
    }));

    const { error: upsertError } = await supabase
      .from('weekly_goal_settings')
      .upsert(upsertData, { onConflict: 'student_type_id,date_type_id' });

    if (upsertError) {
      console.error('Error upserting settings:', upsertError);
      return { success: false, error: upsertError.message };
    }
  }

  // settings 에 없지만 inScope 에는 있는 date_type row 만 삭제.
  // inScope 미지정 시 prune 하지 않음 (다른 지점 데이터 보존).
  if (inScopeDateTypeIds && inScopeDateTypeIds.length > 0) {
    const keepIds = new Set(settings.map((s) => s.date_type_id));
    const removeIds = inScopeDateTypeIds.filter((id) => !keepIds.has(id));
    if (removeIds.length > 0) {
      const { error: pruneError } = await supabase
        .from('weekly_goal_settings')
        .delete()
        .eq('student_type_id', studentTypeId)
        .in('date_type_id', removeIds);
      if (pruneError) {
        console.error('Error pruning obsolete settings:', pruneError);
        return { success: false, error: pruneError.message };
      }
    }
  }

  revalidatePath('/admin/student-types');
  return { success: true };
}

// 주간 목표 설정 삭제
export async function deleteWeeklyGoalSetting(
  studentTypeId: string,
  dateTypeId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('weekly_goal_settings')
    .delete()
    .eq('student_type_id', studentTypeId)
    .eq('date_type_id', dateTypeId);

  if (error) {
    console.error('Error deleting weekly goal setting:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/student-types');
  return { success: true };
}
