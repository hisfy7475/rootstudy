'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { StudentType, StudentTypeSubject } from '@/types/database';

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
