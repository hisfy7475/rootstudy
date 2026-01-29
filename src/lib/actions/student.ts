'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getStudyDate, getStudyDayBounds, getWeekStart } from '@/lib/utils';
import { getMandatoryTime } from './date-type';
import { isInAbsencePeriod } from './absence-schedule';
import { PENALTY_RULES } from '@/lib/constants';
import { createStudentNotification } from './notification';

// 내부용: 자동 벌점 부여 (관리자 로그인 없이)
async function giveAutoPoints(
  studentId: string,
  type: 'reward' | 'penalty',
  amount: number,
  reason: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('points')
    .insert({
      student_id: studentId,
      admin_id: null, // 자동 부여이므로 관리자 없음
      type,
      amount,
      reason,
      is_auto: true,
    });

  if (error) {
    console.error('Error giving auto points:', error);
    return { error: '자동 벌점 부여에 실패했습니다.' };
  }

  // 학생에게 알림 발송
  await createStudentNotification({
    studentId,
    type: 'point',
    title: type === 'penalty' ? '벌점이 부여되었습니다' : '상점이 부여되었습니다',
    message: `${reason} (${type === 'penalty' ? '-' : '+'}${amount}점)`,
    link: '/student/points',
  }).catch(console.error);

  return { success: true };
}

// 학생의 지점 정보 조회
async function getStudentBranchId(studentId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', studentId)
    .single();

  return profile?.branch_id || null;
}

// 지각 체크 및 자동 벌점 부여
async function checkLateArrival(studentId: string) {
  const branchId = await getStudentBranchId(studentId);
  if (!branchId) return; // 지점 정보 없으면 체크 안함

  const now = new Date();
  const studyDate = getStudyDate();
  const dateStr = studyDate.toISOString().split('T')[0];

  // 의무 시간 조회
  const mandatory = await getMandatoryTime(branchId, dateStr);
  if (!mandatory.startTime) return; // 의무 시간 설정 없으면 체크 안함

  // 의무 시작 시간 파싱
  const [startHour, startMinute] = mandatory.startTime.split(':').map(Number);
  const mandatoryStartTime = new Date(studyDate);
  mandatoryStartTime.setHours(startHour, startMinute, 0, 0);

  // 지각 여부 확인 (의무 시작 시간 이후 입실)
  if (now <= mandatoryStartTime) return; // 정시 또는 이전 입실

  // 부재 스케줄 면제 확인
  const exemption = await isInAbsencePeriod(studentId, now, mandatory.dateTypeName as 'semester' | 'vacation' | 'special' | undefined);
  if (exemption.isExempted) return; // 면제 대상

  // 자동 벌점 부여
  await giveAutoPoints(
    studentId,
    'penalty',
    PENALTY_RULES.lateCheckIn.amount,
    PENALTY_RULES.lateCheckIn.reason
  );
}

// 조기퇴실 체크 및 자동 벌점 부여
async function checkEarlyDeparture(studentId: string) {
  const branchId = await getStudentBranchId(studentId);
  if (!branchId) return; // 지점 정보 없으면 체크 안함

  const now = new Date();
  const studyDate = getStudyDate();
  const dateStr = studyDate.toISOString().split('T')[0];

  // 의무 시간 조회
  const mandatory = await getMandatoryTime(branchId, dateStr);
  if (!mandatory.endTime) return; // 의무 시간 설정 없으면 체크 안함

  // 의무 종료 시간 파싱
  const [endHour, endMinute] = mandatory.endTime.split(':').map(Number);
  const mandatoryEndTime = new Date(studyDate);
  
  // 시간이 24시를 넘는 경우 처리 (예: 25:30 = 다음날 01:30)
  if (endHour >= 24) {
    mandatoryEndTime.setDate(mandatoryEndTime.getDate() + 1);
    mandatoryEndTime.setHours(endHour - 24, endMinute, 0, 0);
  } else {
    mandatoryEndTime.setHours(endHour, endMinute, 0, 0);
  }

  // 조기퇴실 여부 확인 (의무 종료 시간 이전 퇴실)
  if (now >= mandatoryEndTime) return; // 정시 또는 이후 퇴실

  // 부재 스케줄 면제 확인
  const exemption = await isInAbsencePeriod(studentId, now, mandatory.dateTypeName as 'semester' | 'vacation' | 'special' | undefined);
  if (exemption.isExempted) return; // 면제 대상

  // 자동 벌점 부여
  await giveAutoPoints(
    studentId,
    'penalty',
    PENALTY_RULES.earlyCheckOut.amount,
    PENALTY_RULES.earlyCheckOut.reason
  );
}

// 학생의 오늘(학습일 기준) 입실/퇴실 기록 조회
export async function getTodayAttendance() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { attendance: [], status: 'checked_out' as const };

  // 학습일 기준으로 조회 (07:30 ~ 다음날 01:30)
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: attendance, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', user.id)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching attendance:', error);
    return { attendance: [], status: 'checked_out' as const };
  }

  // 현재 상태 계산
  let status: 'checked_in' | 'checked_out' | 'on_break' = 'checked_out';
  if (attendance && attendance.length > 0) {
    const lastRecord = attendance[attendance.length - 1];
    if (lastRecord.type === 'check_in') status = 'checked_in';
    else if (lastRecord.type === 'check_out') status = 'checked_out';
    else if (lastRecord.type === 'break_start') status = 'on_break';
    else if (lastRecord.type === 'break_end') status = 'checked_in';
  }

  return { attendance: attendance || [], status };
}

// 오늘(학습일 기준)의 학습시간 계산 (초 단위)
export async function getTodayStudyTime() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { totalSeconds: 0, checkInTime: null };

  // 학습일 기준으로 조회 (07:30 ~ 다음날 01:30)
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', user.id)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: true });

  if (!attendance || attendance.length === 0) {
    return { totalSeconds: 0, checkInTime: null };
  }

  let totalSeconds = 0;
  let checkInTime: Date | null = null;
  let breakStartTime: Date | null = null;

  for (const record of attendance) {
    const timestamp = new Date(record.timestamp);
    
    switch (record.type) {
      case 'check_in':
        checkInTime = timestamp;
        break;
      case 'check_out':
        if (checkInTime) {
          totalSeconds += Math.floor((timestamp.getTime() - checkInTime.getTime()) / 1000);
          checkInTime = null;
        }
        break;
      case 'break_start':
        if (checkInTime) {
          totalSeconds += Math.floor((timestamp.getTime() - checkInTime.getTime()) / 1000);
          checkInTime = null;
          breakStartTime = timestamp;
        }
        break;
      case 'break_end':
        checkInTime = timestamp;
        breakStartTime = null;
        break;
    }
  }

  // 아직 입실 중이면 현재까지 시간 추가 (클라이언트에서 실시간 계산)
  return { 
    totalSeconds, 
    checkInTime: checkInTime ? checkInTime.toISOString() : null 
  };
}

// 주간 목표 달성 현황 조회 (DAY_CONFIG.weekStartsOn 기준)
export async function getWeeklyGoals() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // 이번 주 시작일 (DAY_CONFIG 기준)
  const startOfWeek = getWeekStart();

  const { data: goals } = await supabase
    .from('study_goals')
    .select('*')
    .eq('student_id', user.id)
    .gte('date', startOfWeek.toISOString().split('T')[0])
    .order('date', { ascending: true });

  // 7일간의 데이터 생성
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    const goal = goals?.find(g => g.date === dateStr);
    weekDays.push({
      date: date.toISOString(),
      achieved: goal ? goal.achieved : null,
    });
  }

  return weekDays;
}

// 입실 처리
export async function checkIn() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('attendance')
    .insert({
      student_id: user.id,
      type: 'check_in',
      source: 'manual',
    });

  if (error) {
    console.error('Error checking in:', error);
    return { error: '입실 처리에 실패했습니다.' };
  }

  // 지각 체크 및 자동 벌점 (비동기로 실행, 입실 처리에는 영향 없음)
  checkLateArrival(user.id).catch(console.error);

  revalidatePath('/student');
  return { success: true };
}

// 퇴실 처리
export async function checkOut() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 조기퇴실 체크 및 자동 벌점 (비동기로 실행, 퇴실 처리에는 영향 없음)
  checkEarlyDeparture(user.id).catch(console.error);

  // 현재 학습 중인 과목 자동 종료
  await supabase
    .from('subjects')
    .update({ is_current: false, ended_at: new Date().toISOString() })
    .eq('student_id', user.id)
    .eq('is_current', true);

  const { error } = await supabase
    .from('attendance')
    .insert({
      student_id: user.id,
      type: 'check_out',
      source: 'manual',
    });

  if (error) {
    console.error('Error checking out:', error);
    return { error: '퇴실 처리에 실패했습니다.' };
  }

  revalidatePath('/student');
  revalidatePath('/student/stats');
  return { success: true };
}

// 외출 시작
export async function startBreak() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('attendance')
    .insert({
      student_id: user.id,
      type: 'break_start',
      source: 'manual',
    });

  if (error) {
    console.error('Error starting break:', error);
    return { error: '외출 처리에 실패했습니다.' };
  }

  revalidatePath('/student');
  return { success: true };
}

// 외출 종료 (15분 외출 로직 적용)
export async function endBreak() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 학습일 기준으로 오늘의 break_start 기록 조회
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: breakStartRecord } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', user.id)
    .eq('type', 'break_start')
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  const now = new Date();

  // break_start 기록이 있으면 경과 시간 확인
  if (breakStartRecord) {
    const breakStartTime = new Date(breakStartRecord.timestamp);
    const elapsedMinutes = (now.getTime() - breakStartTime.getTime()) / (1000 * 60);
    
    const { ATTENDANCE_CONFIG } = await import('@/lib/constants');
    
    // 15분 초과 시: 퇴실-재입실 처리
    if (elapsedMinutes > ATTENDANCE_CONFIG.gracePeriodMinutes) {
      // 현재 학습 중인 과목 종료 (break_start 시점으로)
      await supabase
        .from('subjects')
        .update({ is_current: false, ended_at: breakStartRecord.timestamp })
        .eq('student_id', user.id)
        .eq('is_current', true);

      // 1. break_start 시점에 check_out 추가
      const { error: checkOutError } = await supabase
        .from('attendance')
        .insert({
          student_id: user.id,
          type: 'check_out',
          timestamp: breakStartRecord.timestamp, // break_start와 동일 시간
          source: 'manual',
        });

      if (checkOutError) {
        console.error('Error adding check_out:', checkOutError);
        return { error: '퇴실 처리에 실패했습니다.' };
      }

      // 2. 현재 시점에 check_in 추가 (재입실)
      const { error: checkInError } = await supabase
        .from('attendance')
        .insert({
          student_id: user.id,
          type: 'check_in',
          source: 'manual',
        });

      if (checkInError) {
        console.error('Error adding check_in:', checkInError);
        return { error: '재입실 처리에 실패했습니다.' };
      }

      revalidatePath('/student');
      revalidatePath('/student/stats');
      return { success: true, wasLongBreak: true };
    }
  }

  // 15분 이내: 기존 로직 (break_end만 추가)
  const { error } = await supabase
    .from('attendance')
    .insert({
      student_id: user.id,
      type: 'break_end',
      source: 'manual',
    });

  if (error) {
    console.error('Error ending break:', error);
    return { error: '복귀 처리에 실패했습니다.' };
  }

  revalidatePath('/student');
  return { success: true, wasLongBreak: false };
}

// 현재 학습 과목 조회
export async function getCurrentSubject() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('subjects')
    .select('*')
    .eq('student_id', user.id)
    .eq('is_current', true)
    .single();

  return data;
}

// 과목 변경
export async function changeSubject(subjectName: string) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 현재 과목 종료
  await supabase
    .from('subjects')
    .update({ is_current: false, ended_at: new Date().toISOString() })
    .eq('student_id', user.id)
    .eq('is_current', true);

  // 새 과목 시작
  const { error } = await supabase
    .from('subjects')
    .insert({
      student_id: user.id,
      subject_name: subjectName,
      is_current: true,
    });

  if (error) {
    console.error('Error changing subject:', error);
    return { error: '과목 변경에 실패했습니다.' };
  }

  revalidatePath('/student');
  revalidatePath('/student/subject');
  return { success: true };
}

// 오늘(학습일 기준)의 몰입도 조회
export async function getTodayFocus() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // 학습일 기준으로 조회
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data } = await supabase
    .from('focus_scores')
    .select('*')
    .eq('student_id', user.id)
    .gte('recorded_at', start.toISOString())
    .lte('recorded_at', end.toISOString())
    .order('recorded_at', { ascending: true });

  return data || [];
}

// 주간 몰입도 조회 (DAY_CONFIG.weekStartsOn 기준)
export async function getWeeklyFocus() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // 이번 주 시작일 (DAY_CONFIG 기준)
  const startOfWeek = getWeekStart();

  const { data } = await supabase
    .from('focus_scores')
    .select('*')
    .eq('student_id', user.id)
    .gte('recorded_at', startOfWeek.toISOString())
    .order('recorded_at', { ascending: true });

  return data || [];
}

// 상벌점 내역 조회
export async function getPoints(filter?: 'reward' | 'penalty' | 'all') {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { points: [], summary: { reward: 0, penalty: 0, total: 0 } };

  let query = supabase
    .from('points')
    .select('*')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });

  if (filter && filter !== 'all') {
    query = query.eq('type', filter);
  }

  const { data } = await query;

  // 총점 계산
  const allPoints = data || [];
  const reward = allPoints
    .filter(p => p.type === 'reward')
    .reduce((sum, p) => sum + p.amount, 0);
  const penalty = allPoints
    .filter(p => p.type === 'penalty')
    .reduce((sum, p) => sum + p.amount, 0);

  return {
    points: allPoints,
    summary: {
      reward,
      penalty,
      total: reward - penalty,
    },
  };
}

// 오늘(학습일 기준)의 과목 기록 조회
export async function getTodaySubjects() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // 학습일 기준으로 조회
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data } = await supabase
    .from('subjects')
    .select('*')
    .eq('student_id', user.id)
    .gte('started_at', start.toISOString())
    .lte('started_at', end.toISOString())
    .order('started_at', { ascending: true });

  return data || [];
}

// 주간 학습 시간 계산 (분 단위)
export async function getWeeklyStudyTime(studentId?: string): Promise<number> {
  const supabase = await createClient();
  
  let targetStudentId = studentId;
  
  if (!targetStudentId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;
    targetStudentId = user.id;
  }

  // 이번 주 시작일 (DAY_CONFIG 기준)
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // 이번 주의 모든 출석 기록 조회
  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', targetStudentId)
    .gte('timestamp', weekStart.toISOString())
    .lt('timestamp', weekEnd.toISOString())
    .order('timestamp', { ascending: true });

  if (!attendance || attendance.length === 0) {
    return 0;
  }

  let totalMinutes = 0;
  let checkInTime: Date | null = null;

  for (const record of attendance) {
    const timestamp = new Date(record.timestamp);
    
    switch (record.type) {
      case 'check_in':
        checkInTime = timestamp;
        break;
      case 'check_out':
        if (checkInTime) {
          totalMinutes += (timestamp.getTime() - checkInTime.getTime()) / (1000 * 60);
          checkInTime = null;
        }
        break;
      case 'break_start':
        if (checkInTime) {
          totalMinutes += (timestamp.getTime() - checkInTime.getTime()) / (1000 * 60);
          checkInTime = null;
        }
        break;
      case 'break_end':
        checkInTime = timestamp;
        break;
    }
  }

  // 현재 입실 중이면 현재까지 시간 추가
  if (checkInTime) {
    const now = new Date();
    totalMinutes += (now.getTime() - checkInTime.getTime()) / (1000 * 60);
  }

  return Math.floor(totalMinutes);
}

// 주간 목표 달성도 조회
export async function getWeeklyProgress(studentId?: string): Promise<{
  goalHours: number;
  actualMinutes: number;
  progressPercent: number;
  studentTypeName: string | null;
}> {
  const supabase = await createClient();
  
  let targetStudentId = studentId;
  
  if (!targetStudentId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { goalHours: 0, actualMinutes: 0, progressPercent: 0, studentTypeName: null };
    targetStudentId = user.id;
  }

  // 학생의 타입 정보 조회
  const { data: studentProfile } = await supabase
    .from('student_profiles')
    .select(`
      student_type_id,
      student_types (
        name,
        weekly_goal_hours
      )
    `)
    .eq('id', targetStudentId)
    .single();

  let goalHours = 0;
  let studentTypeName: string | null = null;

  if (studentProfile?.student_types) {
    const studentType = studentProfile.student_types as unknown as {
      name: string;
      weekly_goal_hours: number;
    };
    goalHours = studentType.weekly_goal_hours;
    studentTypeName = studentType.name;
  }

  // 주간 학습 시간 조회
  const actualMinutes = await getWeeklyStudyTime(targetStudentId);

  // 달성률 계산
  const goalMinutes = goalHours * 60;
  const progressPercent = goalMinutes > 0 
    ? Math.min(100, Math.round((actualMinutes / goalMinutes) * 100))
    : 0;

  return {
    goalHours,
    actualMinutes,
    progressPercent,
    studentTypeName,
  };
}

// ============================================
// 학습 통계 관련 함수들
// ============================================

export type StudyPeriod = 'daily' | 'weekly' | 'monthly';

interface StudySession {
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
}

interface SubjectStudyRecord {
  subjectName: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
}

interface UnclassifiedSegment {
  id: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

// 월의 시작일 반환
function getMonthStart(date: Date = new Date()): Date {
  const studyDate = getStudyDate(date);
  const monthStart = new Date(studyDate);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return monthStart;
}

// 기간별 날짜 범위 계산
function getPeriodBounds(period: StudyPeriod, baseDate: Date = new Date()): { start: Date; end: Date } {
  const studyDate = getStudyDate(baseDate);
  
  switch (period) {
    case 'daily':
      return getStudyDayBounds(studyDate);
    case 'weekly': {
      const weekStart = getWeekStart(baseDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return { start: weekStart, end: weekEnd };
    }
    case 'monthly': {
      const monthStart = getMonthStart(baseDate);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      return { start: monthStart, end: monthEnd };
    }
  }
}

// 출석 기록에서 학습 세션 추출
function extractStudySessions(
  attendance: Array<{ type: string; timestamp: string }>,
  periodEnd: Date
): StudySession[] {
  const sessions: StudySession[] = [];
  let checkInTime: Date | null = null;

  for (const record of attendance) {
    const timestamp = new Date(record.timestamp);
    
    switch (record.type) {
      case 'check_in':
        checkInTime = timestamp;
        break;
      case 'check_out':
        if (checkInTime) {
          sessions.push({
            startTime: checkInTime,
            endTime: timestamp,
            durationSeconds: Math.floor((timestamp.getTime() - checkInTime.getTime()) / 1000),
          });
          checkInTime = null;
        }
        break;
      case 'break_start':
        if (checkInTime) {
          sessions.push({
            startTime: checkInTime,
            endTime: timestamp,
            durationSeconds: Math.floor((timestamp.getTime() - checkInTime.getTime()) / 1000),
          });
          checkInTime = null;
        }
        break;
      case 'break_end':
        checkInTime = timestamp;
        break;
    }
  }

  // 현재 입실 중이면 현재까지 세션 추가
  if (checkInTime) {
    const now = new Date();
    const endTime = now < periodEnd ? now : periodEnd;
    sessions.push({
      startTime: checkInTime,
      endTime,
      durationSeconds: Math.floor((endTime.getTime() - checkInTime.getTime()) / 1000),
    });
  }

  return sessions;
}

// 기간별 학습 통계 조회
export async function getStudyStatsByPeriod(
  period: StudyPeriod,
  baseDate?: Date
): Promise<{
  totalSeconds: number;
  sessions: StudySession[];
  periodStart: string;
  periodEnd: string;
}> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { totalSeconds: 0, sessions: [], periodStart: '', periodEnd: '' };

  const { start, end } = getPeriodBounds(period, baseDate);

  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', user.id)
    .gte('timestamp', start.toISOString())
    .lt('timestamp', end.toISOString())
    .order('timestamp', { ascending: true });

  const sessions = extractStudySessions(attendance || [], end);
  const totalSeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);

  return {
    totalSeconds,
    sessions,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

// 기간별 과목별 학습시간 조회
export async function getSubjectStudyTime(
  period: StudyPeriod,
  baseDate?: Date
): Promise<{
  subjectTimes: Record<string, number>;
  subjectRecords: SubjectStudyRecord[];
  unclassifiedSeconds: number;
  unclassifiedSegments: UnclassifiedSegment[];
}> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { 
      subjectTimes: {}, 
      subjectRecords: [], 
      unclassifiedSeconds: 0, 
      unclassifiedSegments: [] 
    };
  }

  const { start, end } = getPeriodBounds(period, baseDate);

  // 과목 기록 조회
  const { data: subjects } = await supabase
    .from('subjects')
    .select('*')
    .eq('student_id', user.id)
    .gte('started_at', start.toISOString())
    .lt('started_at', end.toISOString())
    .order('started_at', { ascending: true });

  // 출석 기록 조회 (총 학습 시간 계산용)
  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', user.id)
    .gte('timestamp', start.toISOString())
    .lt('timestamp', end.toISOString())
    .order('timestamp', { ascending: true });

  // 학습 세션 추출
  const studySessions = extractStudySessions(attendance || [], end);
  const totalStudySeconds = studySessions.reduce((sum, s) => sum + s.durationSeconds, 0);

  // 과목별 시간 계산
  const subjectTimes: Record<string, number> = {};
  const subjectRecords: SubjectStudyRecord[] = [];

  for (const subject of subjects || []) {
    const subjectStart = new Date(subject.started_at);
    const subjectEnd = subject.ended_at 
      ? new Date(subject.ended_at) 
      : subject.is_current 
        ? new Date() 
        : subjectStart;

    const durationSeconds = Math.floor((subjectEnd.getTime() - subjectStart.getTime()) / 1000);
    
    subjectTimes[subject.subject_name] = (subjectTimes[subject.subject_name] || 0) + durationSeconds;
    subjectRecords.push({
      subjectName: subject.subject_name,
      startTime: subjectStart,
      endTime: subjectEnd,
      durationSeconds,
    });
  }

  const classifiedSeconds = Object.values(subjectTimes).reduce((sum, s) => sum + s, 0);
  const unclassifiedSeconds = Math.max(0, totalStudySeconds - classifiedSeconds);

  // 미분류 구간 계산
  const unclassifiedSegments = calculateUnclassifiedSegments(studySessions, subjectRecords);

  return {
    subjectTimes,
    subjectRecords,
    unclassifiedSeconds,
    unclassifiedSegments,
  };
}

// 미분류 구간 계산
function calculateUnclassifiedSegments(
  studySessions: StudySession[],
  subjectRecords: SubjectStudyRecord[]
): UnclassifiedSegment[] {
  const segments: UnclassifiedSegment[] = [];
  
  for (const session of studySessions) {
    // 이 세션과 겹치는 과목 기록 찾기
    const overlappingSubjects = subjectRecords.filter(sr => 
      sr.startTime < session.endTime && sr.endTime > session.startTime
    );

    if (overlappingSubjects.length === 0) {
      // 전체 세션이 미분류
      segments.push({
        id: `${session.startTime.getTime()}`,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime.toISOString(),
        durationSeconds: session.durationSeconds,
      });
    } else {
      // 세션 내 미분류 구간 찾기
      const covered: Array<{ start: number; end: number }> = [];
      
      for (const sr of overlappingSubjects) {
        const overlapStart = Math.max(session.startTime.getTime(), sr.startTime.getTime());
        const overlapEnd = Math.min(session.endTime.getTime(), sr.endTime.getTime());
        if (overlapEnd > overlapStart) {
          covered.push({ start: overlapStart, end: overlapEnd });
        }
      }

      // 커버된 구간 병합
      covered.sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      for (const c of covered) {
        if (merged.length === 0 || merged[merged.length - 1].end < c.start) {
          merged.push(c);
        } else {
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, c.end);
        }
      }

      // 미분류 구간 추출
      let currentStart = session.startTime.getTime();
      for (const m of merged) {
        if (m.start > currentStart) {
          const duration = Math.floor((m.start - currentStart) / 1000);
          if (duration > 0) {
            segments.push({
              id: `${currentStart}`,
              startTime: new Date(currentStart).toISOString(),
              endTime: new Date(m.start).toISOString(),
              durationSeconds: duration,
            });
          }
        }
        currentStart = m.end;
      }

      // 마지막 구간
      if (currentStart < session.endTime.getTime()) {
        const duration = Math.floor((session.endTime.getTime() - currentStart) / 1000);
        if (duration > 0) {
          segments.push({
            id: `${currentStart}`,
            startTime: new Date(currentStart).toISOString(),
            endTime: session.endTime.toISOString(),
            durationSeconds: duration,
          });
        }
      }
    }
  }

  return segments;
}

// 일별 학습 시간 추이 (주간/월간 용)
export async function getDailyStudyTrend(
  period: 'weekly' | 'monthly',
  baseDate?: Date
): Promise<Array<{ date: string; totalSeconds: number; subjectTimes: Record<string, number> }>> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { start, end } = getPeriodBounds(period, baseDate);
  
  // 전체 기간의 출석 기록
  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', user.id)
    .gte('timestamp', start.toISOString())
    .lt('timestamp', end.toISOString())
    .order('timestamp', { ascending: true });

  // 전체 기간의 과목 기록
  const { data: subjects } = await supabase
    .from('subjects')
    .select('*')
    .eq('student_id', user.id)
    .gte('started_at', start.toISOString())
    .lt('started_at', end.toISOString())
    .order('started_at', { ascending: true });

  // 일별로 데이터 그룹화
  const dailyData: Map<string, { 
    attendance: typeof attendance;
    subjects: typeof subjects;
  }> = new Map();

  // 기간 내 모든 날짜 초기화
  const current = new Date(start);
  while (current < end) {
    const dateStr = current.toISOString().split('T')[0];
    dailyData.set(dateStr, { attendance: [], subjects: [] });
    current.setDate(current.getDate() + 1);
  }

  // 출석 기록 분류
  for (const a of attendance || []) {
    const dateStr = getStudyDate(new Date(a.timestamp)).toISOString().split('T')[0];
    const day = dailyData.get(dateStr);
    if (day) {
      day.attendance = [...(day.attendance || []), a];
    }
  }

  // 과목 기록 분류
  for (const s of subjects || []) {
    const dateStr = getStudyDate(new Date(s.started_at)).toISOString().split('T')[0];
    const day = dailyData.get(dateStr);
    if (day) {
      day.subjects = [...(day.subjects || []), s];
    }
  }

  // 일별 통계 계산
  const result: Array<{ date: string; totalSeconds: number; subjectTimes: Record<string, number> }> = [];
  
  for (const [dateStr, data] of dailyData) {
    const dayBounds = getStudyDayBounds(new Date(dateStr));
    const sessions = extractStudySessions(data.attendance || [], dayBounds.end);
    const totalSeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);

    const subjectTimes: Record<string, number> = {};
    for (const subject of data.subjects || []) {
      const subjectStart = new Date(subject.started_at);
      const subjectEnd = subject.ended_at 
        ? new Date(subject.ended_at) 
        : subject.is_current 
          ? new Date() 
          : subjectStart;
      const durationSeconds = Math.floor((subjectEnd.getTime() - subjectStart.getTime()) / 1000);
      subjectTimes[subject.subject_name] = (subjectTimes[subject.subject_name] || 0) + durationSeconds;
    }

    result.push({ date: dateStr, totalSeconds, subjectTimes });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// 이전 기간 대비 비교
export async function getStudyComparison(
  period: StudyPeriod,
  baseDate?: Date
): Promise<{
  currentSeconds: number;
  previousSeconds: number;
  changePercent: number;
  changeDirection: 'up' | 'down' | 'same';
}> {
  const date = baseDate || new Date();
  
  // 현재 기간 통계
  const currentStats = await getStudyStatsByPeriod(period, date);
  
  // 이전 기간 날짜 계산
  let previousDate: Date;
  switch (period) {
    case 'daily':
      previousDate = new Date(date);
      previousDate.setDate(previousDate.getDate() - 1);
      break;
    case 'weekly':
      previousDate = new Date(date);
      previousDate.setDate(previousDate.getDate() - 7);
      break;
    case 'monthly':
      previousDate = new Date(date);
      previousDate.setMonth(previousDate.getMonth() - 1);
      break;
  }

  // 이전 기간 통계
  const previousStats = await getStudyStatsByPeriod(period, previousDate);

  const changePercent = previousStats.totalSeconds > 0
    ? Math.round(((currentStats.totalSeconds - previousStats.totalSeconds) / previousStats.totalSeconds) * 100)
    : currentStats.totalSeconds > 0 ? 100 : 0;

  const changeDirection = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'same';

  return {
    currentSeconds: currentStats.totalSeconds,
    previousSeconds: previousStats.totalSeconds,
    changePercent: Math.abs(changePercent),
    changeDirection,
  };
}

// 미분류 시간을 과목에 할당
export async function assignUnclassifiedTime(
  startTime: string,
  endTime: string,
  subjectName: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (end <= start) {
    return { error: '종료 시간이 시작 시간보다 커야 합니다.' };
  }

  // 해당 시간대에 이미 과목 기록이 있는지 확인
  const { data: existingSubjects } = await supabase
    .from('subjects')
    .select('*')
    .eq('student_id', user.id)
    .lt('started_at', end.toISOString())
    .or(`ended_at.gt.${start.toISOString()},ended_at.is.null`);

  // 겹치는 구간이 있으면 에러
  for (const existing of existingSubjects || []) {
    const existingStart = new Date(existing.started_at);
    const existingEnd = existing.ended_at ? new Date(existing.ended_at) : new Date();
    
    if (existingStart < end && existingEnd > start) {
      return { error: '이미 과목이 할당된 시간대와 겹칩니다.' };
    }
  }

  // 새 과목 기록 삽입
  const { error } = await supabase
    .from('subjects')
    .insert({
      student_id: user.id,
      subject_name: subjectName,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      is_current: false,
    });

  if (error) {
    console.error('Error assigning subject:', error);
    return { error: '과목 할당에 실패했습니다.' };
  }

  revalidatePath('/student/stats');
  revalidatePath('/student/subject');
  return { success: true };
}

// ============================================
// 학생 설정 관련 함수들
// ============================================

// 학생 프로필 정보 타입
export interface StudentProfileInfo {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  birthday: string | null;
  seatNumber: number | null;
  parentCode: string;
  branchName: string | null;
  studentTypeName: string | null;
}

// 연결된 학부모 정보 타입
export interface LinkedParent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

// 학생 본인 프로필 조회 (parent_code 포함)
export async function getStudentProfile(): Promise<StudentProfileInfo | null> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // profiles 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      name,
      phone,
      branch_id,
      branches (
        name
      )
    `)
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  // student_profiles 조회
  const { data: studentProfile } = await supabase
    .from('student_profiles')
    .select(`
      seat_number,
      parent_code,
      birthday,
      student_type_id,
      student_types (
        name
      )
    `)
    .eq('id', user.id)
    .single();

  if (!studentProfile) return null;

  const branch = profile.branches as unknown as { name: string } | null;
  const studentType = studentProfile.student_types as unknown as { name: string } | null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    phone: profile.phone,
    birthday: studentProfile.birthday,
    seatNumber: studentProfile.seat_number,
    parentCode: studentProfile.parent_code,
    branchName: branch?.name || null,
    studentTypeName: studentType?.name || null,
  };
}

// 학생 프로필 정보 수정 (이름, 전화번호)
export async function updateStudentProfile(data: {
  name?: string;
  phone?: string;
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const updateData: { name?: string; phone?: string | null } = {};
  
  if (data.name !== undefined) {
    if (!data.name.trim()) {
      return { error: '이름을 입력해주세요.' };
    }
    updateData.name = data.name.trim();
  }
  
  if (data.phone !== undefined) {
    updateData.phone = data.phone.trim() || null;
  }

  if (Object.keys(updateData).length === 0) {
    return { error: '수정할 항목이 없습니다.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id);

  if (error) {
    console.error('Error updating profile:', error);
    return { error: '프로필 수정에 실패했습니다.' };
  }

  revalidatePath('/student/settings');
  return { success: true };
}

// 연결된 학부모 목록 조회
export async function getLinkedParents(): Promise<LinkedParent[]> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // parent_student_links에서 연결된 학부모 ID 목록 조회
  const { data: links } = await supabase
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', user.id);

  if (!links || links.length === 0) return [];

  const parentIds = links.map(link => link.parent_id);

  // 학부모 정보 조회
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email, phone')
    .in('id', parentIds);

  if (!profiles) return [];

  return profiles.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
  }));
}

// 비밀번호 변경
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: '로그인이 필요합니다.' };

  if (!currentPassword || !newPassword) {
    return { error: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' };
  }

  if (newPassword.length < 6) {
    return { error: '새 비밀번호는 6자 이상이어야 합니다.' };
  }

  // 현재 비밀번호 확인 (재로그인 시도)
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    return { error: '현재 비밀번호가 올바르지 않습니다.' };
  }

  // 비밀번호 변경
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    console.error('Error changing password:', updateError);
    return { error: '비밀번호 변경에 실패했습니다.' };
  }

  return { success: true };
}
