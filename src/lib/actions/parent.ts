'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getStudyDate, getStudyDayBounds } from '@/lib/utils';
import { getWeeklyProgress, getWeeklyGoals } from '@/lib/actions/student';

// 학생 정보 타입
export interface LinkedStudent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  seatNumber: number | null;
}

// 주간 학습 진행 데이터 타입
export interface WeeklyProgressData {
  goalHours: number;
  actualMinutes: number;
  progressPercent: number;
  studentTypeName: string | null;
}

export interface WeeklyGoalDay {
  date: string;
  achieved: boolean | null;
}

// 학생별 대시보드 데이터 타입
export interface StudentDashboardData {
  student: LinkedStudent;
  status: 'checked_in' | 'checked_out' | 'on_break';
  lastUpdate: string | null;
  studyTime: number;
  currentSubject: string | null;
  todayFocus: number | null;
  latestActivity: string | null;  // 최근 학습 상태 (인강 수강 중, 수면 중 등)
  pendingSchedules: number;
  weeklyProgress: WeeklyProgressData;
  weeklyGoals: WeeklyGoalDay[];
}

// 연결된 모든 학생 정보 조회 (1:N)
export async function getLinkedStudents(): Promise<LinkedStudent[]> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // parent_student_links에서 연결된 학생 ID 목록 조회
  const { data: links } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', user.id);

  if (!links || links.length === 0) return [];

  const studentIds = links.map(link => link.student_id);

  // 학생 정보 조회
  const { data: studentProfiles } = await supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (
        name,
        email,
        phone
      )
    `)
    .in('id', studentIds);

  if (!studentProfiles) return [];

  return studentProfiles.map(sp => {
    const profile = sp.profiles as unknown as {
      name: string;
      email: string;
      phone: string | null;
    };

    return {
      id: sp.id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      seatNumber: sp.seat_number,
    };
  });
}

// 학생 현재 상태 조회 (입실/퇴실/외출)
// forParentView: true일 경우 외출 상태를 퇴실로 표시
export async function getStudentStatus(studentId: string, options?: { forParentView?: boolean }) {
  const supabase = await createClient();

  // 학습일 기준으로 조회 (07:30 ~ 다음날 01:30)
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', studentId)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: true });

  if (!attendance || attendance.length === 0) {
    return { status: 'checked_out' as const, lastUpdate: null, actualStatus: 'checked_out' as const };
  }

  const lastRecord = attendance[attendance.length - 1];
  let actualStatus: 'checked_in' | 'checked_out' | 'on_break' = 'checked_out';
  
  if (lastRecord.type === 'check_in') actualStatus = 'checked_in';
  else if (lastRecord.type === 'check_out') actualStatus = 'checked_out';
  else if (lastRecord.type === 'break_start') actualStatus = 'on_break';
  else if (lastRecord.type === 'break_end') actualStatus = 'checked_in';

  // 학부모 뷰일 경우 외출 상태를 퇴실로 표시
  let displayStatus = actualStatus;
  let displayLastUpdate = lastRecord.timestamp;
  
  if (options?.forParentView && actualStatus === 'on_break') {
    displayStatus = 'checked_out';
    // 외출 시작 시간을 퇴실 시간으로 표시
  }

  return { 
    status: displayStatus, 
    lastUpdate: displayLastUpdate,
    actualStatus, // 실제 상태 (관리자용 등에서 필요할 경우)
  };
}

// 학생의 오늘 학습시간 조회 (초 단위)
export async function getStudentStudyTime(studentId: string) {
  const supabase = await createClient();

  // 학습일 기준으로 조회 (07:30 ~ 다음날 01:30)
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', studentId)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: true });

  if (!attendance || attendance.length === 0) {
    return { totalSeconds: 0, checkInTime: null };
  }

  let totalSeconds = 0;
  let checkInTime: Date | null = null;

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
        }
        break;
      case 'break_end':
        checkInTime = timestamp;
        break;
    }
  }

  // 현재 입실 중이면 현재까지의 시간도 계산
  if (checkInTime) {
    const now = new Date();
    totalSeconds += Math.floor((now.getTime() - checkInTime.getTime()) / 1000);
  }

  return { totalSeconds, checkInTime: checkInTime?.toISOString() || null };
}

// 학생의 현재 학습 과목 조회
export async function getStudentCurrentSubject(studentId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('subjects')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_current', true)
    .single();

  return data?.subject_name || null;
}

// 학생의 오늘 몰입도 점수 조회
export async function getStudentTodayFocus(studentId: string) {
  const supabase = await createClient();

  // 학습일 기준으로 조회 (07:30 ~ 다음날 01:30)
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data } = await supabase
    .from('focus_scores')
    .select('*')
    .eq('student_id', studentId)
    .gte('recorded_at', start.toISOString())
    .lte('recorded_at', end.toISOString())
    .order('recorded_at', { ascending: false });

  if (!data || data.length === 0) {
    return { scores: [], average: null, latestActivity: null };
  }

  const average = Math.round(
    data.reduce((sum, s) => sum + s.score, 0) / data.length
  );

  // 가장 최근 기록의 활동 상태 (note 필드)
  const latestActivity = data[0]?.note || null;

  return { scores: data, average, latestActivity };
}

// 학부모 대시보드용 통합 데이터 조회 (모든 자녀)
export async function getParentDashboardData(): Promise<{
  students: StudentDashboardData[];
}> {
  const linkedStudents = await getLinkedStudents();
  
  if (linkedStudents.length === 0) {
    return {
      students: [],
    };
  }

  // 모든 자녀의 데이터를 병렬로 조회
  // 학부모 뷰에서는 외출 상태를 퇴실로 표시
  const studentsData = await Promise.all(
    linkedStudents.map(async (student) => {
      const [status, studyTime, currentSubject, todayFocus, weeklyProgressData, weeklyGoalsData] = await Promise.all([
        getStudentStatus(student.id, { forParentView: true }),
        getStudentStudyTime(student.id),
        getStudentCurrentSubject(student.id),
        getStudentTodayFocus(student.id),
        getWeeklyProgress(student.id),
        getWeeklyGoals(student.id),
      ]);

      return {
        student,
        status: status.status,
        lastUpdate: status.lastUpdate,
        studyTime: studyTime.totalSeconds,
        currentSubject,
        todayFocus: todayFocus.average,
        latestActivity: todayFocus.latestActivity,
        pendingSchedules: 0,
        weeklyProgress: weeklyProgressData,
        weeklyGoals: weeklyGoalsData,
      };
    })
  );

  return {
    students: studentsData,
  };
}

// 학부모 대시보드용 단일 자녀 데이터 조회
export async function getParentDashboardDataForStudent(studentId: string): Promise<{
  student: StudentDashboardData | null;
}> {
  const linkedStudents = await getLinkedStudents();
  const student = linkedStudents.find(s => s.id === studentId);
  
  if (!student) {
    return {
      student: null,
    };
  }

  // 학부모 뷰에서는 외출 상태를 퇴실로 표시
  const [status, studyTime, currentSubject, todayFocus, weeklyProgressData, weeklyGoalsData] = await Promise.all([
    getStudentStatus(student.id, { forParentView: true }),
    getStudentStudyTime(student.id),
    getStudentCurrentSubject(student.id),
    getStudentTodayFocus(student.id),
    getWeeklyProgress(student.id),
    getWeeklyGoals(student.id),
  ]);

  const studentData: StudentDashboardData = {
    student,
    status: status.status,
    lastUpdate: status.lastUpdate,
    studyTime: studyTime.totalSeconds,
    currentSubject,
    todayFocus: todayFocus.average,
    latestActivity: todayFocus.latestActivity,
    pendingSchedules: 0,
    weeklyProgress: weeklyProgressData,
    weeklyGoals: weeklyGoalsData,
  };

  return {
    student: studentData,
  };
}

// 자녀 추가 (연결 코드로)
export async function addChildToParent(code: string) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 연결 코드로 학생 찾기
  const { data: studentProfile, error: studentError } = await supabase
    .from('student_profiles')
    .select('id')
    .eq('parent_code', code)
    .single();

  if (studentError || !studentProfile) {
    return { error: '유효하지 않은 연결 코드입니다.' };
  }

  // 이미 연결되어 있는지 확인
  const { data: existingLink } = await supabase
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', user.id)
    .eq('student_id', studentProfile.id)
    .single();

  if (existingLink) {
    return { error: '이미 연결된 자녀입니다.' };
  }

  // 연결 추가
  const { error: linkError } = await supabase
    .from('parent_student_links')
    .insert({
      parent_id: user.id,
      student_id: studentProfile.id,
    });

  if (linkError) {
    console.error('Error adding child link:', linkError);
    return { error: '자녀 연결에 실패했습니다.' };
  }

  revalidatePath('/parent');
  revalidatePath('/parent/settings');
  return { success: true };
}

// 주간 리포트 타입
export interface DailyStudyData {
  date: string;            // YYYY-MM-DD (학습일 기준)
  studySeconds: number;    // 해당 날 순공시간(초)
  hasAttendance: boolean;  // 출석 여부
  focusAvg: number | null; // 해당 날 몰입도 평균
}

export interface WeeklyAttendanceStat {
  totalWeekdays: number;   // 지난 주중일 수(월~금, 미래 제외)
  attendedDays: number;
  absentDays: number;
  attendanceRate: number;  // 정상 출석 %
  absentRate: number;      // 결석 %
}

export interface WeeklyReportData {
  weekStart: string;        // ISO string (월요일)
  weekEnd: string;          // ISO string (일요일)
  studentName: string;
  dailyData: DailyStudyData[];   // 7일치 (월~일)
  attendanceStat: WeeklyAttendanceStat;
  weeklyFocusAvg: number | null;
}

// 주간 리포트 데이터 조회 (학부모용)
export async function getWeeklyReportData(
  studentId: string,
  weekStartDate: Date
): Promise<WeeklyReportData | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 부모-자녀 연결 확인
  const { data: link } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', user.id)
    .eq('student_id', studentId)
    .single();

  if (!link) return null;

  // 학생 이름 조회
  const { data: profileData } = await supabase
    .from('student_profiles')
    .select('profiles!inner(name)')
    .eq('id', studentId)
    .single();

  const studentName =
    (profileData?.profiles as unknown as { name: string })?.name || '';

  // 주의 7일(월~일) 날짜 배열
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  // 주 전체 범위
  const { start: periodStart } = getStudyDayBounds(days[0]);
  const { end: periodEnd } = getStudyDayBounds(days[6]);

  // 출석 기록 + 몰입도 점수 병렬 조회
  const [{ data: attendanceRecords }, { data: focusScores }] = await Promise.all([
    supabase
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .gte('timestamp', periodStart.toISOString())
      .lte('timestamp', periodEnd.toISOString())
      .order('timestamp', { ascending: true }),
    supabase
      .from('focus_scores')
      .select('score, recorded_at')
      .eq('student_id', studentId)
      .gte('recorded_at', periodStart.toISOString())
      .lte('recorded_at', periodEnd.toISOString()),
  ]);

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // 일별 데이터 계산
  const dailyData: DailyStudyData[] = days.map((day) => {
    const dateStr = day.toISOString().split('T')[0];
    const { start, end } = getStudyDayBounds(day);

    // 해당 날의 출석 기록 필터
    const dayAttendance = (attendanceRecords || []).filter((r) => {
      const t = new Date(r.timestamp);
      return t >= start && t <= end;
    });

    const hasAttendance = dayAttendance.some((r) => r.type === 'check_in');

    // 순공시간 계산
    let studySeconds = 0;
    let checkInTime: Date | null = null;

    for (const record of dayAttendance) {
      const timestamp = new Date(record.timestamp);
      switch (record.type) {
        case 'check_in':
          checkInTime = timestamp;
          break;
        case 'check_out':
          if (checkInTime) {
            studySeconds += Math.floor(
              (timestamp.getTime() - checkInTime.getTime()) / 1000
            );
            checkInTime = null;
          }
          break;
        case 'break_start':
          if (checkInTime) {
            studySeconds += Math.floor(
              (timestamp.getTime() - checkInTime.getTime()) / 1000
            );
            checkInTime = null;
          }
          break;
        case 'break_end':
          checkInTime = timestamp;
          break;
      }
    }

    // 오늘 날짜 중 아직 퇴실 안 한 경우 현재 시각까지 계산
    if (checkInTime) {
      const endTime = end < today ? end : new Date();
      studySeconds += Math.floor(
        (endTime.getTime() - checkInTime.getTime()) / 1000
      );
    }

    // 몰입도 평균
    const dayFocus = (focusScores || []).filter((f) => {
      const t = new Date(f.recorded_at);
      return t >= start && t <= end;
    });
    const focusAvg =
      dayFocus.length > 0
        ? Math.round(
            (dayFocus.reduce((sum, f) => sum + f.score, 0) / dayFocus.length) * 10
          ) / 10
        : null;

    return { date: dateStr, studySeconds, hasAttendance, focusAvg };
  });

  // 출결 통계 (월~금, 미래 제외)
  const weekdays = dailyData.slice(0, 5);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const pastWeekdays = weekdays.filter((d) => new Date(d.date) <= todayMidnight);
  const attendedDays = pastWeekdays.filter((d) => d.hasAttendance).length;
  const absentDays = pastWeekdays.length - attendedDays;
  const totalWeekdays = pastWeekdays.length;
  const attendanceRate =
    totalWeekdays > 0 ? Math.round((attendedDays / totalWeekdays) * 100) : 0;
  const absentRate =
    totalWeekdays > 0 ? Math.round((absentDays / totalWeekdays) * 100) : 0;

  // 주간 몰입도 평균
  const focusDays = dailyData.filter((d) => d.focusAvg !== null);
  const weeklyFocusAvg =
    focusDays.length > 0
      ? Math.round(
          (focusDays.reduce((sum, d) => sum + (d.focusAvg || 0), 0) /
            focusDays.length) *
            10
        ) / 10
      : null;

  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    weekStart: weekStartDate.toISOString(),
    weekEnd: weekEnd.toISOString(),
    studentName,
    dailyData,
    attendanceStat: {
      totalWeekdays,
      attendedDays,
      absentDays,
      attendanceRate,
      absentRate,
    },
    weeklyFocusAvg,
  };
}

// 자녀 연결 해제
export async function removeChildFromParent(studentId: string) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('parent_student_links')
    .delete()
    .eq('parent_id', user.id)
    .eq('student_id', studentId);

  if (error) {
    console.error('Error removing child link:', error);
    return { error: '자녀 연결 해제에 실패했습니다.' };
  }

  revalidatePath('/parent');
  revalidatePath('/parent/settings');
  return { success: true };
}
