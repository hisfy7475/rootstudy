'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { StudentType, StudentTypeSubject, WeeklyGoalSetting, DateTypeDefinition } from '@/types/database';

// 주간 목표 설정 타입
export interface WeeklyGoalSettingWithDateType extends WeeklyGoalSetting {
  date_type?: DateTypeDefinition;
}

// 학생 타입 목록 조회
export async function getStudentTypes(branchId?: string): Promise<StudentType[]> {
  const supabase = await createClient();
  
  let query = supabase
    .from('student_types')
    .select('*')
    .order('name');
  
  if (branchId) {
    query = query.eq('branch_id', branchId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching student types:', error);
    return [];
  }
  
  return data || [];
}

// 학생 타입 상세 조회
export async function getStudentType(id: string): Promise<StudentType | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('student_types')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error('Error fetching student type:', error);
    return null;
  }
  
  return data;
}

// 학생 타입 생성
export async function createStudentType(data: {
  name: string;
  weekly_goal_hours: number;
  branch_id?: string | null;
}): Promise<{ success: boolean; data?: StudentType; error?: string }> {
  const supabase = await createClient();
  
  const { data: newType, error } = await supabase
    .from('student_types')
    .insert({
      name: data.name,
      weekly_goal_hours: data.weekly_goal_hours,
      branch_id: data.branch_id || null,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating student type:', error);
    return { success: false, error: error.message };
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
    branch_id?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('student_types')
    .update(data)
    .eq('id', id);
  
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
  
  const { error } = await supabase
    .from('student_types')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting student type:', error);
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/student-types');
  return { success: true };
}

// 타입별 과목 목록 조회
export async function getStudentTypeSubjects(studentTypeId: string): Promise<StudentTypeSubject[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('student_type_subjects')
    .select('*')
    .eq('student_type_id', studentTypeId)
    .order('subject_name');
  
  if (error) {
    console.error('Error fetching student type subjects:', error);
    return [];
  }
  
  return data || [];
}

// 타입별 과목 설정 (기존 과목 삭제 후 새로 등록)
export async function setStudentTypeSubjects(
  studentTypeId: string,
  subjects: string[]
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
  
  // 새 과목 추가
  if (subjects.length > 0) {
    const insertData = subjects.map(subject => ({
      student_type_id: studentTypeId,
      subject_name: subject,
    }));
    
    const { error: insertError } = await supabase
      .from('student_type_subjects')
      .insert(insertData);
    
    if (insertError) {
      console.error('Error inserting subjects:', insertError);
      return { success: false, error: insertError.message };
    }
  }
  
  revalidatePath('/admin/student-types');
  return { success: true };
}

// 학생의 타입에 해당하는 과목 목록 조회
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
  
  // 타입별 과목 조회
  const { data: subjects, error: subjectsError } = await supabase
    .from('student_type_subjects')
    .select('subject_name')
    .eq('student_type_id', studentProfile.student_type_id)
    .order('subject_name');
  
  if (subjectsError) {
    console.error('Error fetching subjects for student:', subjectsError);
    return [];
  }
  
  return subjects?.map(s => s.subject_name) || [];
}

// 학생의 타입 변경 (학생 프로필의 student_type_id 업데이트)
export async function assignStudentType(
  studentId: string,
  studentTypeId: string | null
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

// 타입별 학생 수 조회
export async function getStudentTypeStudentCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('student_profiles')
    .select('student_type_id');
  
  if (error) {
    console.error('Error fetching student counts:', error);
    return {};
  }
  
  const counts: Record<string, number> = {};
  data?.forEach(student => {
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
  studentTypeId: string
): Promise<WeeklyGoalSettingWithDateType[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('weekly_goal_settings')
    .select(`
      *,
      date_type:date_type_definitions(*)
    `)
    .eq('student_type_id', studentTypeId);
  
  if (error) {
    console.error('Error fetching weekly goal settings:', error);
    return [];
  }
  
  return data || [];
}

// 학생 타입의 지점에 해당하는 날짜 타입 목록 조회
export async function getDateTypesForStudentType(
  studentTypeId: string
): Promise<DateTypeDefinition[]> {
  const supabase = await createClient();
  
  // 학생 타입의 지점 조회
  const { data: studentType, error: typeError } = await supabase
    .from('student_types')
    .select('branch_id')
    .eq('id', studentTypeId)
    .single();
  
  if (typeError || !studentType?.branch_id) {
    console.error('Error fetching student type branch:', typeError);
    return [];
  }
  
  // 해당 지점의 날짜 타입 목록 조회
  const { data: dateTypes, error: dateError } = await supabase
    .from('date_type_definitions')
    .select('*')
    .eq('branch_id', studentType.branch_id)
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
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('weekly_goal_settings')
    .upsert(
      {
        student_type_id: data.student_type_id,
        date_type_id: data.date_type_id,
        weekly_goal_hours: data.weekly_goal_hours,
        reward_points: data.reward_points,
        penalty_points: data.penalty_points,
      },
      {
        onConflict: 'student_type_id,date_type_id',
      }
    );
  
  if (error) {
    console.error('Error saving weekly goal setting:', error);
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/student-types');
  return { success: true };
}

// 주간 목표 설정 일괄 저장
export async function saveWeeklyGoalSettingsBatch(
  studentTypeId: string,
  settings: Array<{
    date_type_id: string;
    weekly_goal_hours: number;
    reward_points: number;
    penalty_points: number;
  }>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  // 기존 설정 삭제
  const { error: deleteError } = await supabase
    .from('weekly_goal_settings')
    .delete()
    .eq('student_type_id', studentTypeId);
  
  if (deleteError) {
    console.error('Error deleting existing settings:', deleteError);
    return { success: false, error: deleteError.message };
  }
  
  // 새 설정 추가
  if (settings.length > 0) {
    const insertData = settings.map(s => ({
      student_type_id: studentTypeId,
      date_type_id: s.date_type_id,
      weekly_goal_hours: s.weekly_goal_hours,
      reward_points: s.reward_points,
      penalty_points: s.penalty_points,
    }));
    
    const { error: insertError } = await supabase
      .from('weekly_goal_settings')
      .insert(insertData);
    
    if (insertError) {
      console.error('Error inserting settings:', insertError);
      return { success: false, error: insertError.message };
    }
  }
  
  revalidatePath('/admin/student-types');
  return { success: true };
}

// 주간 목표 설정 삭제
export async function deleteWeeklyGoalSetting(
  studentTypeId: string,
  dateTypeId: string
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
