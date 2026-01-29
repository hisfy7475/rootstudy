'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { StudentAbsenceSchedule } from '@/types/database';
import { ABSENCE_BUFFER_MINUTES } from '@/lib/constants';
import { format, parse, addMinutes, subMinutes, isWithinInterval, getDay } from 'date-fns';

// 부재 스케줄 목록 조회 (학생용)
export async function getMyAbsenceSchedules(): Promise<StudentAbsenceSchedule[]> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  
  const { data, error } = await supabase
    .from('student_absence_schedules')
    .select('*')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching absence schedules:', error);
    return [];
  }
  
  return data || [];
}

// 특정 학생의 부재 스케줄 조회 (관리자/학부모용)
export async function getStudentAbsenceSchedules(studentId: string): Promise<StudentAbsenceSchedule[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('student_absence_schedules')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching student absence schedules:', error);
    return [];
  }
  
  return data || [];
}

// 모든 학생의 부재 스케줄 조회 (관리자용)
export async function getAllAbsenceSchedules(): Promise<(StudentAbsenceSchedule & { student_name?: string })[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('student_absence_schedules')
    .select(`
      *,
      student_profiles!inner(
        profiles!inner(name)
      )
    `)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching all absence schedules:', error);
    return [];
  }
  
  // 학생 이름 추출
  return (data || []).map(schedule => ({
    ...schedule,
    student_name: (schedule.student_profiles as any)?.profiles?.name || '알 수 없음',
  }));
}

// 부재 스케줄 생성
export async function createAbsenceSchedule(data: {
  title: string;
  description?: string;
  is_recurring: boolean;
  recurrence_type?: 'weekly' | 'one_time';
  day_of_week?: number[];
  start_time: string;
  end_time: string;
  date_type?: 'semester' | 'vacation' | 'all';
  valid_from?: string;
  valid_until?: string;
  specific_date?: string;
}): Promise<{ success: boolean; data?: StudentAbsenceSchedule; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: '로그인이 필요합니다.' };
  }
  
  const { data: newSchedule, error } = await supabase
    .from('student_absence_schedules')
    .insert({
      student_id: user.id,
      title: data.title,
      description: data.description || null,
      is_recurring: data.is_recurring,
      recurrence_type: data.is_recurring ? (data.recurrence_type || 'weekly') : 'one_time',
      day_of_week: data.day_of_week || null,
      start_time: data.start_time,
      end_time: data.end_time,
      date_type: data.date_type || 'all',
      valid_from: data.valid_from || null,
      valid_until: data.valid_until || null,
      specific_date: data.is_recurring ? null : data.specific_date,
      buffer_minutes: ABSENCE_BUFFER_MINUTES,
      is_active: true,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating absence schedule:', error);
    return { success: false, error: error.message };
  }
  
  revalidatePath('/student/schedule');
  return { success: true, data: newSchedule };
}

// 부재 스케줄 수정
export async function updateAbsenceSchedule(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    is_recurring: boolean;
    recurrence_type: 'weekly' | 'one_time';
    day_of_week: number[] | null;
    start_time: string;
    end_time: string;
    date_type: 'semester' | 'vacation' | 'all';
    valid_from: string | null;
    valid_until: string | null;
    specific_date: string | null;
    is_active: boolean;
  }>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('student_absence_schedules')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (error) {
    console.error('Error updating absence schedule:', error);
    return { success: false, error: error.message };
  }
  
  revalidatePath('/student/schedule');
  return { success: true };
}

// 부재 스케줄 삭제
export async function deleteAbsenceSchedule(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('student_absence_schedules')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting absence schedule:', error);
    return { success: false, error: error.message };
  }
  
  revalidatePath('/student/schedule');
  return { success: true };
}

// 부재 스케줄 활성/비활성 토글
export async function toggleAbsenceSchedule(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  // 현재 상태 조회
  const { data: schedule, error: fetchError } = await supabase
    .from('student_absence_schedules')
    .select('is_active')
    .eq('id', id)
    .single();
  
  if (fetchError) {
    return { success: false, error: fetchError.message };
  }
  
  // 상태 토글
  const { error } = await supabase
    .from('student_absence_schedules')
    .update({ 
      is_active: !schedule.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (error) {
    console.error('Error toggling absence schedule:', error);
    return { success: false, error: error.message };
  }
  
  revalidatePath('/student/schedule');
  return { success: true };
}

// 특정 시간이 부재 면제 구간인지 확인 (버퍼 포함)
export async function isInAbsencePeriod(
  studentId: string,
  checkTime: Date,
  currentDateType?: 'semester' | 'vacation' | 'special'
): Promise<{
  isExempted: boolean;
  schedule?: StudentAbsenceSchedule;
  exemptionStart?: Date;
  exemptionEnd?: Date;
}> {
  const supabase = await createClient();
  
  // 활성화된 부재 스케줄 조회
  const { data: schedules, error } = await supabase
    .from('student_absence_schedules')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', true);
  
  if (error || !schedules) {
    return { isExempted: false };
  }
  
  const checkDate = format(checkTime, 'yyyy-MM-dd');
  const checkDayOfWeek = getDay(checkTime);
  
  for (const schedule of schedules) {
    // 날짜 타입 체크
    if (schedule.date_type !== 'all' && currentDateType) {
      if (schedule.date_type === 'semester' && currentDateType !== 'semester') continue;
      if (schedule.date_type === 'vacation' && currentDateType !== 'vacation') continue;
    }
    
    // 유효 기간 체크
    if (schedule.valid_from && checkDate < schedule.valid_from) continue;
    if (schedule.valid_until && checkDate > schedule.valid_until) continue;
    
    // 일회성 스케줄 체크
    if (!schedule.is_recurring) {
      if (schedule.specific_date !== checkDate) continue;
    } else {
      // 반복 스케줄: 요일 체크
      if (schedule.day_of_week && !schedule.day_of_week.includes(checkDayOfWeek)) continue;
    }
    
    // 시간 체크 (버퍼 포함)
    const scheduleStart = parse(schedule.start_time, 'HH:mm:ss', checkTime);
    const scheduleEnd = parse(schedule.end_time, 'HH:mm:ss', checkTime);
    
    const bufferMinutes = schedule.buffer_minutes || ABSENCE_BUFFER_MINUTES;
    const exemptionStart = subMinutes(scheduleStart, bufferMinutes);
    const exemptionEnd = addMinutes(scheduleEnd, bufferMinutes);
    
    if (isWithinInterval(checkTime, { start: exemptionStart, end: exemptionEnd })) {
      return {
        isExempted: true,
        schedule,
        exemptionStart,
        exemptionEnd,
      };
    }
  }
  
  return { isExempted: false };
}

// 오늘 해당하는 부재 스케줄 조회
export async function getTodayAbsenceSchedules(studentId: string): Promise<StudentAbsenceSchedule[]> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayDayOfWeek = getDay(today);
  
  const { data: schedules, error } = await supabase
    .from('student_absence_schedules')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', true);
  
  if (error || !schedules) {
    return [];
  }
  
  return schedules.filter(schedule => {
    // 유효 기간 체크
    if (schedule.valid_from && todayStr < schedule.valid_from) return false;
    if (schedule.valid_until && todayStr > schedule.valid_until) return false;
    
    // 일회성 스케줄
    if (!schedule.is_recurring) {
      return schedule.specific_date === todayStr;
    }
    
    // 반복 스케줄
    if (schedule.day_of_week && !schedule.day_of_week.includes(todayDayOfWeek)) {
      return false;
    }
    
    return true;
  });
}
