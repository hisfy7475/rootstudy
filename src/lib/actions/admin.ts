'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getStudyDate, getStudyDayBounds, getWeekStart } from '@/lib/utils';

// ============================================
// 학생 현황 관련
// ============================================

// 전체 학생 목록 조회 (현황 포함)
export async function getAllStudents(statusFilter?: 'all' | 'checked_in' | 'checked_out' | 'on_break') {
  const supabase = await createClient();

  // 학생 프로필 조회
  const { data: students, error } = await supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (
        id,
        name,
        email,
        phone
      )
    `)
    .order('seat_number', { ascending: true });

  if (error) {
    console.error('Error fetching students:', error);
    return [];
  }

  // 학습일 기준으로 조회 (07:30 ~ 다음날 01:30)
  const studyDate = getStudyDate();
  const { start: todayStart, end: todayEnd } = getStudyDayBounds(studyDate);

  // 각 학생의 상태와 학습 정보 조회
  const studentsWithStatus = await Promise.all(
    (students || []).map(async (student) => {
      const profile = Array.isArray(student.profiles) 
        ? student.profiles[0] 
        : student.profiles;

      // 학습일 기준 출석 기록
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', student.id)
        .gte('timestamp', todayStart.toISOString())
        .lte('timestamp', todayEnd.toISOString())
        .order('timestamp', { ascending: true });

      // 현재 상태 계산
      let status: 'checked_in' | 'checked_out' | 'on_break' = 'checked_out';
      let checkInTime: string | null = null;
      let totalStudySeconds = 0;

      if (attendance && attendance.length > 0) {
        let tempCheckInTime: Date | null = null;

        for (const record of attendance) {
          const timestamp = new Date(record.timestamp);

          switch (record.type) {
            case 'check_in':
              tempCheckInTime = timestamp;
              status = 'checked_in';
              break;
            case 'check_out':
              if (tempCheckInTime) {
                totalStudySeconds += Math.floor((timestamp.getTime() - tempCheckInTime.getTime()) / 1000);
                tempCheckInTime = null;
              }
              status = 'checked_out';
              break;
            case 'break_start':
              if (tempCheckInTime) {
                totalStudySeconds += Math.floor((timestamp.getTime() - tempCheckInTime.getTime()) / 1000);
                tempCheckInTime = null;
              }
              status = 'on_break';
              break;
            case 'break_end':
              tempCheckInTime = timestamp;
              status = 'checked_in';
              break;
          }
        }

        // 현재 입실 중이면 현재까지 시간 추가
        if (tempCheckInTime) {
          totalStudySeconds += Math.floor((new Date().getTime() - tempCheckInTime.getTime()) / 1000);
          checkInTime = tempCheckInTime.toISOString();
        }

        // 첫 입실 시간 찾기
        const firstCheckIn = attendance.find(a => a.type === 'check_in');
        if (firstCheckIn) {
          checkInTime = firstCheckIn.timestamp;
        }
      }

      // 현재 과목
      const { data: currentSubject } = await supabase
        .from('subjects')
        .select('subject_name')
        .eq('student_id', student.id)
        .eq('is_current', true)
        .single();

      // 학습일 기준 몰입도 평균
      const { data: focusScores } = await supabase
        .from('focus_scores')
        .select('score')
        .eq('student_id', student.id)
        .gte('recorded_at', todayStart.toISOString())
        .lte('recorded_at', todayEnd.toISOString());

      const avgFocus = focusScores && focusScores.length > 0
        ? Math.round(focusScores.reduce((sum, f) => sum + f.score, 0) / focusScores.length * 10) / 10
        : null;

      // 오늘 상벌점
      const { data: todayPoints } = await supabase
        .from('points')
        .select('type, amount')
        .eq('student_id', student.id)
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString());

      const todayReward = (todayPoints || [])
        .filter(p => p.type === 'reward')
        .reduce((sum, p) => sum + p.amount, 0);
      const todayPenalty = (todayPoints || [])
        .filter(p => p.type === 'penalty')
        .reduce((sum, p) => sum + p.amount, 0);

      return {
        id: student.id,
        seatNumber: student.seat_number,
        name: profile?.name || '이름 없음',
        email: profile?.email || '',
        phone: profile?.phone || '',
        status,
        checkInTime,
        totalStudySeconds,
        currentSubject: currentSubject?.subject_name || null,
        avgFocus,
        todayReward,
        todayPenalty,
      };
    })
  );

  // 필터 적용
  if (statusFilter && statusFilter !== 'all') {
    return studentsWithStatus.filter(s => s.status === statusFilter);
  }

  return studentsWithStatus;
}

// 학생 과목 설정 (관리자가 직접)
export async function setStudentSubject(studentId: string, subjectName: string) {
  const supabase = await createClient();

  // 현재 과목 종료
  await supabase
    .from('subjects')
    .update({ is_current: false, ended_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('is_current', true);

  // 새 과목 시작
  const { error } = await supabase
    .from('subjects')
    .insert({
      student_id: studentId,
      subject_name: subjectName,
      is_current: true,
    });

  if (error) {
    console.error('Error setting subject:', error);
    return { error: '과목 설정에 실패했습니다.' };
  }

  revalidatePath('/admin');
  return { success: true };
}

// ============================================
// 몰입도 관련
// ============================================

// 몰입도 점수 입력
export async function recordFocusScore(
  studentId: string, 
  score: number, 
  note?: string,
  periodId?: string
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('focus_scores')
    .insert({
      student_id: studentId,
      admin_id: user.id,
      score,
      note,
      period_id: periodId || null,
    });

  if (error) {
    console.error('Error recording focus:', error);
    return { error: '몰입도 기록에 실패했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/focus');
  return { success: true };
}

// 학생별 몰입도 기록 조회 (기간별)
export async function getStudentFocusHistory(studentId: string, startDate: string, endDate: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('focus_scores')
    .select(`
      *,
      profiles:admin_id (name)
    `)
    .eq('student_id', studentId)
    .gte('recorded_at', startDate)
    .lte('recorded_at', endDate)
    .order('recorded_at', { ascending: false });

  return data || [];
}

// 전체 몰입도 리포트 (주간) - DAY_CONFIG.weekStartsOn 기준
export async function getWeeklyFocusReport() {
  const supabase = await createClient();

  // 이번 주 시작일 (DAY_CONFIG 기준)
  const startOfWeek = getWeekStart();

  // 학생 목록
  const { data: students } = await supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (name)
    `)
    .order('seat_number', { ascending: true });

  // 각 학생의 주간 몰입도
  const report = await Promise.all(
    (students || []).map(async (student) => {
      const profile = Array.isArray(student.profiles) 
        ? student.profiles[0] 
        : student.profiles;

      const { data: scores } = await supabase
        .from('focus_scores')
        .select('score, recorded_at')
        .eq('student_id', student.id)
        .gte('recorded_at', startOfWeek.toISOString());

      // 일별 평균 계산
      const dailyScores: { [key: string]: number[] } = {};
      (scores || []).forEach(s => {
        const date = new Date(s.recorded_at).toISOString().split('T')[0];
        if (!dailyScores[date]) dailyScores[date] = [];
        dailyScores[date].push(s.score);
      });

      const weeklyAvg = scores && scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length * 10) / 10
        : null;

      return {
        id: student.id,
        seatNumber: student.seat_number,
        name: profile?.name || '이름 없음',
        dailyScores,
        weeklyAvg,
        totalRecords: scores?.length || 0,
      };
    })
  );

  return report;
}

// ============================================
// 상벌점 관련
// ============================================

// 상벌점 부여
export async function givePoints(
  studentId: string,
  type: 'reward' | 'penalty',
  amount: number,
  reason: string,
  isAuto: boolean = false
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('points')
    .insert({
      student_id: studentId,
      admin_id: user.id,
      type,
      amount,
      reason,
      is_auto: isAuto,
    });

  if (error) {
    console.error('Error giving points:', error);
    return { error: '상벌점 부여에 실패했습니다.' };
  }

  // 학생에게 알림 발송 (자동 부여가 아닌 경우만 - 자동은 student.ts에서 처리)
  if (!isAuto) {
    const { createStudentNotification } = await import('./notification');
    await createStudentNotification({
      studentId,
      type: 'point',
      title: type === 'penalty' ? '벌점이 부여되었습니다' : '상점이 부여되었습니다',
      message: `${reason} (${type === 'penalty' ? '-' : '+'}${amount}점)`,
      link: '/student/points',
    }).catch(console.error);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  return { success: true };
}

// 상벌점 현황 조회
export async function getPointsOverview() {
  const supabase = await createClient();

  // 학생 목록
  const { data: students } = await supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (name)
    `)
    .order('seat_number', { ascending: true });

  // 각 학생의 상벌점 합계
  const overview = await Promise.all(
    (students || []).map(async (student) => {
      const profile = Array.isArray(student.profiles) 
        ? student.profiles[0] 
        : student.profiles;

      const { data: points } = await supabase
        .from('points')
        .select('type, amount')
        .eq('student_id', student.id);

      const reward = (points || [])
        .filter(p => p.type === 'reward')
        .reduce((sum, p) => sum + p.amount, 0);

      const penalty = (points || [])
        .filter(p => p.type === 'penalty')
        .reduce((sum, p) => sum + p.amount, 0);

      return {
        id: student.id,
        seatNumber: student.seat_number,
        name: profile?.name || '이름 없음',
        reward,
        penalty,
        total: reward - penalty,
      };
    })
  );

  return overview;
}

// 상벌점 내역 조회 (전체)
export async function getAllPointsHistory(filter?: 'reward' | 'penalty' | 'all') {
  const supabase = await createClient();

  let query = supabase
    .from('points')
    .select(`
      *,
      student:student_id (
        seat_number,
        profiles!inner (name)
      ),
      admin:admin_id (name)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filter && filter !== 'all') {
    query = query.eq('type', filter);
  }

  const { data } = await query;

  return (data || []).map(p => {
    const studentProfile = Array.isArray(p.student?.profiles) 
      ? p.student?.profiles[0] 
      : p.student?.profiles;
    
    return {
      ...p,
      studentName: studentProfile?.name || '이름 없음',
      studentSeatNumber: p.student?.seat_number || null,
      adminName: p.admin?.name || '시스템',
    };
  });
}

// ============================================
// 회원 관리 관련
// ============================================

// 전체 회원 목록 조회
export async function getAllMembers(userType?: 'student' | 'parent' | 'admin') {
  const supabase = await createClient();

  let query = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (userType) {
    query = query.eq('user_type', userType);
  }

  const { data } = await query;
  return data || [];
}

// 학부모 목록 조회 (연결된 학생 정보 포함)
export async function getAllParentsWithStudents() {
  const supabase = await createClient();

  // 학부모 프로필 조회
  const { data: parents, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_type', 'parent')
    .order('created_at', { ascending: false });

  if (error || !parents) {
    console.error('Error fetching parents:', error);
    return [];
  }

  // 각 학부모의 연결된 학생 정보 조회
  const parentsWithStudents = await Promise.all(
    parents.map(async (parent) => {
      // parent_student_links 테이블을 통해 연결된 학생들 조회
      const { data: links } = await supabase
        .from('parent_student_links')
        .select(`
          student:student_id (
            id,
            seat_number,
            profiles!inner (
              name
            )
          )
        `)
        .eq('parent_id', parent.id);

      const students = (links || []).map((link: any) => {
        const studentProfile = link.student 
          ? (Array.isArray(link.student.profiles) ? link.student.profiles[0] : link.student.profiles)
          : null;
        return {
          id: link.student?.id || '',
          name: studentProfile?.name || '이름 없음',
          seatNumber: link.student?.seat_number || null,
        };
      });

      return {
        id: parent.id,
        email: parent.email,
        name: parent.name,
        phone: parent.phone,
        user_type: parent.user_type,
        created_at: parent.created_at,
        students,
      };
    })
  );

  return parentsWithStudents;
}

// 학생 상세 정보 조회
export async function getStudentDetail(studentId: string) {
  const supabase = await createClient();

  const { data: student } = await supabase
    .from('student_profiles')
    .select(`
      *,
      profiles!inner (*),
      student_type:student_type_id (
        id,
        name,
        weekly_goal_hours
      )
    `)
    .eq('id', studentId)
    .single();

  if (!student) return null;

  // 연결된 학부모
  const { data: parent } = await supabase
    .from('parent_profiles')
    .select(`
      profiles!inner (*)
    `)
    .eq('student_id', studentId)
    .single();

  // 학습 통계 (최근 30일)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('student_id', studentId)
    .gte('timestamp', thirtyDaysAgo.toISOString());

  const { data: focusScores } = await supabase
    .from('focus_scores')
    .select('score')
    .eq('student_id', studentId)
    .gte('recorded_at', thirtyDaysAgo.toISOString());

  const { data: points } = await supabase
    .from('points')
    .select('type, amount')
    .eq('student_id', studentId);

  const profile = Array.isArray(student.profiles) 
    ? student.profiles[0] 
    : student.profiles;

  const parentProfile = parent 
    ? (Array.isArray(parent.profiles) ? parent.profiles[0] : parent.profiles)
    : null;

  return {
    id: student.id,
    seatNumber: student.seat_number,
    parentCode: student.parent_code,
    capsId: student.caps_id,
    studentTypeId: student.student_type_id,
    studentType: student.student_type ? {
      id: student.student_type.id,
      name: student.student_type.name,
      weeklyGoalHours: student.student_type.weekly_goal_hours,
    } : null,
    name: profile?.name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    createdAt: profile?.created_at || '',
    branchId: profile?.branch_id || null,
    parent: parentProfile ? {
      name: parentProfile.name,
      email: parentProfile.email,
      phone: parentProfile.phone,
    } : null,
    stats: {
      attendanceDays: new Set(
        (attendance || [])
          .filter(a => a.type === 'check_in')
          .map(a => new Date(a.timestamp).toISOString().split('T')[0])
      ).size,
      avgFocus: focusScores && focusScores.length > 0
        ? Math.round(focusScores.reduce((sum, f) => sum + f.score, 0) / focusScores.length * 10) / 10
        : null,
      totalReward: (points || []).filter(p => p.type === 'reward').reduce((sum, p) => sum + p.amount, 0),
      totalPenalty: (points || []).filter(p => p.type === 'penalty').reduce((sum, p) => sum + p.amount, 0),
    },
  };
}

// 학생 CAPS ID 수정
export async function updateStudentCapsId(studentId: string, capsId: string | null) {
  const supabase = await createClient();

  // CAPS ID 앞의 0 제거 (예: "0004" -> "4")
  const normalizedCapsId = capsId ? String(parseInt(capsId, 10)) : null;

  const { error } = await supabase
    .from('student_profiles')
    .update({ caps_id: normalizedCapsId })
    .eq('id', studentId);

  if (error) {
    console.error('Error updating CAPS ID:', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/members');
  return true;
}

// 회원 정보 수정
export async function updateMember(userId: string, data: { name?: string; phone?: string }) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating member:', error);
    return { error: '회원 정보 수정에 실패했습니다.' };
  }

  revalidatePath('/admin/members');
  return { success: true };
}

// 학생 좌석 번호 수정
export async function updateStudentSeat(studentId: string, seatNumber: number | null) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('student_profiles')
    .update({ seat_number: seatNumber })
    .eq('id', studentId);

  if (error) {
    console.error('Error updating seat:', error);
    return { error: '좌석 번호 수정에 실패했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/members');
  return { success: true };
}

// 학생 타입(학년) 수정
export async function updateStudentType(studentId: string, studentTypeId: string | null) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('student_profiles')
    .update({ student_type_id: studentTypeId || null })
    .eq('id', studentId);

  if (error) {
    console.error('Error updating student type:', error);
    return { error: '학생 타입 수정에 실패했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/members');
  return { success: true };
}

// ============================================
// 학생 승인 관련
// ============================================

// 학생 가입 승인 (CAPS ID, 좌석번호, 학생타입 설정)
export async function approveStudent(
  studentId: string,
  capsId: string,
  seatNumber: number | null,
  studentTypeId: string | null
) {
  const supabase = await createClient();

  // 1. profiles 테이블에서 is_approved를 true로 업데이트
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ is_approved: true })
    .eq('id', studentId);

  if (profileError) {
    console.error('Error approving student profile:', profileError);
    return { success: false, error: '학생 승인에 실패했습니다.' };
  }

  // 2. student_profiles 테이블에서 caps_id, seat_number, student_type_id 업데이트
  const { error: studentError } = await supabase
    .from('student_profiles')
    .update({
      caps_id: capsId || null,
      seat_number: seatNumber,
      student_type_id: studentTypeId || null,
    })
    .eq('id', studentId);

  if (studentError) {
    console.error('Error updating student profile:', studentError);
    return { success: false, error: '학생 정보 업데이트에 실패했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/members');
  return { success: true };
}

// ============================================
// 알림 관련
// ============================================

// 알림 목록 조회
export async function getNotifications(limit: number = 50) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('notifications')
    .select(`
      *,
      parent:parent_id (
        profiles!inner (name)
      ),
      student:student_id (
        seat_number,
        profiles!inner (name)
      )
    `)
    .order('sent_at', { ascending: false })
    .limit(limit);

  return (data || []).map(n => {
    const parentProfile = n.parent 
      ? (Array.isArray(n.parent.profiles) ? n.parent.profiles[0] : n.parent.profiles)
      : null;
    const studentProfile = n.student 
      ? (Array.isArray(n.student.profiles) ? n.student.profiles[0] : n.student.profiles)
      : null;

    return {
      ...n,
      parentName: parentProfile?.name || '알 수 없음',
      studentName: studentProfile?.name || '알 수 없음',
      studentSeatNumber: n.student?.seat_number || null,
    };
  });
}

// 수동 알림 발송 (기록만)
export async function sendNotification(
  parentId: string,
  studentId: string,
  type: 'late' | 'absent' | 'point' | 'schedule',
  message: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('notifications')
    .insert({
      parent_id: parentId,
      student_id: studentId,
      type,
      message,
      is_sent: false, // 실제 발송은 카카오 연동 후
    });

  if (error) {
    console.error('Error sending notification:', error);
    return { error: '알림 발송에 실패했습니다.' };
  }

  revalidatePath('/admin/notifications');
  return { success: true };
}

// ============================================
// 데이터 다운로드 관련
// ============================================

// 학생 데이터 조회 (엑셀 다운로드용)
export async function getStudentDataForExport() {
  const supabase = await createClient();

  const { data: students } = await supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      parent_code,
      created_at,
      profiles!inner (name, email, phone)
    `)
    .order('seat_number', { ascending: true });

  return (students || []).map(s => {
    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    return {
      좌석번호: s.seat_number || '',
      이름: profile?.name || '',
      이메일: profile?.email || '',
      전화번호: profile?.phone || '',
      학부모연결코드: s.parent_code || '',
      가입일: s.created_at ? new Date(s.created_at).toLocaleDateString('ko-KR') : '',
    };
  });
}

// 학습시간 데이터 조회 (엑셀 다운로드용)
export async function getAttendanceDataForExport(startDate: string, endDate: string) {
  const supabase = await createClient();

  const { data: students } = await supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (name)
    `)
    .order('seat_number', { ascending: true });

  const results = [];

  for (const student of students || []) {
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;

    const { data: attendance } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', student.id)
      .gte('timestamp', startDate)
      .lte('timestamp', endDate)
      .order('timestamp', { ascending: true });

    // 날짜별로 그룹화하여 학습시간 계산
    const dailyData: { [key: string]: { checkIn: string | null; checkOut: string | null; studyMinutes: number } } = {};

    let currentCheckIn: Date | null = null;
    let currentDate = '';

    for (const record of attendance || []) {
      const timestamp = new Date(record.timestamp);
      const date = timestamp.toISOString().split('T')[0];

      if (!dailyData[date]) {
        dailyData[date] = { checkIn: null, checkOut: null, studyMinutes: 0 };
      }

      switch (record.type) {
        case 'check_in':
          if (!dailyData[date].checkIn) {
            dailyData[date].checkIn = timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          }
          currentCheckIn = timestamp;
          currentDate = date;
          break;
        case 'check_out':
          dailyData[date].checkOut = timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
          if (currentCheckIn && currentDate === date) {
            dailyData[date].studyMinutes += Math.floor((timestamp.getTime() - currentCheckIn.getTime()) / 60000);
          }
          currentCheckIn = null;
          break;
        case 'break_start':
          if (currentCheckIn && currentDate === date) {
            dailyData[date].studyMinutes += Math.floor((timestamp.getTime() - currentCheckIn.getTime()) / 60000);
          }
          currentCheckIn = null;
          break;
        case 'break_end':
          currentCheckIn = timestamp;
          currentDate = date;
          break;
      }
    }

    for (const [date, data] of Object.entries(dailyData)) {
      results.push({
        날짜: date,
        좌석번호: student.seat_number || '',
        이름: profile?.name || '',
        입실시간: data.checkIn || '',
        퇴실시간: data.checkOut || '',
        학습시간: `${Math.floor(data.studyMinutes / 60)}시간 ${data.studyMinutes % 60}분`,
      });
    }
  }

  return results.sort((a, b) => a.날짜.localeCompare(b.날짜));
}

// 몰입도 데이터 조회 (엑셀 다운로드용)
export async function getFocusDataForExport(startDate: string, endDate: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('focus_scores')
    .select(`
      *,
      student:student_id (
        seat_number,
        profiles!inner (name)
      ),
      admin:admin_id (name)
    `)
    .gte('recorded_at', startDate)
    .lte('recorded_at', endDate)
    .order('recorded_at', { ascending: false });

  return (data || []).map(f => {
    const studentProfile = f.student 
      ? (Array.isArray(f.student.profiles) ? f.student.profiles[0] : f.student.profiles)
      : null;

    return {
      날짜: new Date(f.recorded_at).toLocaleDateString('ko-KR'),
      시간: new Date(f.recorded_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      좌석번호: f.student?.seat_number || '',
      이름: studentProfile?.name || '',
      점수: f.score,
      메모: f.note || '',
      기록자: f.admin?.name || '시스템',
    };
  });
}

// 상벌점 데이터 조회 (엑셀 다운로드용)
export async function getPointsDataForExport(startDate: string, endDate: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('points')
    .select(`
      *,
      student:student_id (
        seat_number,
        profiles!inner (name)
      ),
      admin:admin_id (name)
    `)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  return (data || []).map(p => {
    const studentProfile = p.student 
      ? (Array.isArray(p.student.profiles) ? p.student.profiles[0] : p.student.profiles)
      : null;

    return {
      날짜: new Date(p.created_at).toLocaleDateString('ko-KR'),
      좌석번호: p.student?.seat_number || '',
      이름: studentProfile?.name || '',
      구분: p.type === 'reward' ? '상점' : '벌점',
      점수: p.amount,
      사유: p.reason,
      자동부여: p.is_auto ? 'Y' : 'N',
      부여자: p.admin?.name || '시스템',
    };
  });
}

// ============================================
// 스케줄 관련 (관리자용)
// ============================================

// 대기 중인 스케줄 조회
export async function getPendingSchedules() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('schedules')
    .select(`
      *,
      student:student_id (
        seat_number,
        profiles!inner (name)
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return (data || []).map(s => {
    const studentProfile = s.student 
      ? (Array.isArray(s.student.profiles) ? s.student.profiles[0] : s.student.profiles)
      : null;

    return {
      ...s,
      studentName: studentProfile?.name || '알 수 없음',
      studentSeatNumber: s.student?.seat_number || null,
    };
  });
}

// ============================================
// 관리자 관리 관련
// ============================================

// 전체 관리자 목록 조회 (지점 정보 포함)
export async function getAllAdmins() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      branch:branch_id (
        id,
        name
      )
    `)
    .eq('user_type', 'admin')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching admins:', error);
    return [];
  }

  return (data || []).map(admin => ({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    phone: admin.phone,
    branch_id: admin.branch_id,
    branch_name: admin.branch?.name || null,
    created_at: admin.created_at,
  }));
}

// 관리자 지점 변경
export async function updateAdminBranch(adminId: string, branchId: string | null) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update({ branch_id: branchId })
    .eq('id', adminId)
    .eq('user_type', 'admin');

  if (error) {
    console.error('Error updating admin branch:', error);
    return { error: '지점 변경에 실패했습니다.' };
  }

  revalidatePath('/admin/members');
  return { success: true };
}

// ============================================
// 몰입도 점수 프리셋 관련
// ============================================

export interface FocusScorePreset {
  id: string;
  branch_id: string;
  score: number;
  label: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

// 몰입도 점수 프리셋 조회
export async function getFocusScorePresets(branchId: string): Promise<FocusScorePreset[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('focus_score_presets')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching focus score presets:', error);
    return [];
  }

  return data || [];
}

// 몰입도 점수 프리셋 생성
export async function createFocusScorePreset(
  branchId: string,
  score: number,
  label: string,
  color: string = 'bg-primary'
) {
  const supabase = await createClient();

  // 최대 sort_order 조회
  const { data: maxOrder } = await supabase
    .from('focus_score_presets')
    .select('sort_order')
    .eq('branch_id', branchId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sortOrder = (maxOrder?.sort_order || 0) + 1;

  const { data, error } = await supabase
    .from('focus_score_presets')
    .insert({
      branch_id: branchId,
      score,
      label,
      color,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating focus score preset:', error);
    if (error.code === '23505') {
      return { error: '이미 해당 점수의 프리셋이 존재합니다.' };
    }
    return { error: '프리셋 생성에 실패했습니다.' };
  }

  revalidatePath('/admin/focus');
  return { success: true, data };
}

// 몰입도 점수 프리셋 수정
export async function updateFocusScorePreset(
  id: string,
  data: { score?: number; label?: string; color?: string; sort_order?: number }
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('focus_score_presets')
    .update(data)
    .eq('id', id);

  if (error) {
    console.error('Error updating focus score preset:', error);
    if (error.code === '23505') {
      return { error: '이미 해당 점수의 프리셋이 존재합니다.' };
    }
    return { error: '프리셋 수정에 실패했습니다.' };
  }

  revalidatePath('/admin/focus');
  return { success: true };
}

// 몰입도 점수 프리셋 삭제 (비활성화)
export async function deleteFocusScorePreset(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('focus_score_presets')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting focus score preset:', error);
    return { error: '프리셋 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/focus');
  return { success: true };
}

// ============================================
// 벌점 프리셋 관련
// ============================================

export interface PenaltyPreset {
  id: string;
  branch_id: string;
  amount: number;
  reason: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

// 벌점 프리셋 조회
export async function getPenaltyPresets(branchId: string): Promise<PenaltyPreset[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('penalty_presets')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    // 테이블이 없으면 빈 배열 반환 (기본 프리셋 사용)
    console.error('Error fetching penalty presets:', error);
    return [];
  }

  return data || [];
}

// 벌점 프리셋 생성
export async function createPenaltyPreset(
  branchId: string,
  amount: number,
  reason: string,
  color: string = 'bg-red-500'
) {
  const supabase = await createClient();

  // 최대 sort_order 조회
  const { data: maxOrder } = await supabase
    .from('penalty_presets')
    .select('sort_order')
    .eq('branch_id', branchId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sortOrder = (maxOrder?.sort_order || 0) + 1;

  const { data, error } = await supabase
    .from('penalty_presets')
    .insert({
      branch_id: branchId,
      amount,
      reason,
      color,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating penalty preset:', error);
    return { error: '프리셋 생성에 실패했습니다.' };
  }

  revalidatePath('/admin/focus');
  return { success: true, data };
}

// 벌점 프리셋 삭제 (비활성화)
export async function deletePenaltyPreset(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('penalty_presets')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting penalty preset:', error);
    return { error: '프리셋 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/focus');
  revalidatePath('/admin/points');
  return { success: true };
}

// ============================================
// 상점 프리셋 관련
// ============================================

export interface RewardPreset {
  id: string;
  branch_id: string;
  amount: number;
  reason: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

// 상점 프리셋 조회
export async function getRewardPresets(branchId: string): Promise<RewardPreset[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reward_presets')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching reward presets:', error);
    return [];
  }

  return data || [];
}

// 상점 프리셋 생성
export async function createRewardPreset(
  branchId: string,
  amount: number,
  reason: string,
  color: string = 'bg-green-500'
) {
  const supabase = await createClient();

  // 최대 sort_order 조회
  const { data: maxOrder } = await supabase
    .from('reward_presets')
    .select('sort_order')
    .eq('branch_id', branchId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const sortOrder = (maxOrder?.sort_order || 0) + 1;

  const { data, error } = await supabase
    .from('reward_presets')
    .insert({
      branch_id: branchId,
      amount,
      reason,
      color,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating reward preset:', error);
    return { error: '프리셋 생성에 실패했습니다.' };
  }

  revalidatePath('/admin/points');
  return { success: true, data };
}

// 상점 프리셋 삭제 (비활성화)
export async function deleteRewardPreset(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('reward_presets')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting reward preset:', error);
    return { error: '프리셋 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/points');
  return { success: true };
}

// ============================================
// 출석부 관련
// ============================================

// 출석부 데이터 조회 (학생별 상태, 부재 스케줄, 미등원 시간, 몰입도)
export async function getAttendanceBoard() {
  const supabase = await createClient();

  // 학습일 기준으로 조회 (07:30 ~ 다음날 01:30)
  const studyDate = getStudyDate();
  const { start: todayStart, end: todayEnd } = getStudyDayBounds(studyDate);
  const todayStr = studyDate.toISOString().split('T')[0];
  const todayDayOfWeek = studyDate.getDay();

  // 학생 프로필 조회
  const { data: students, error } = await supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (
        id,
        name,
        email,
        phone
      )
    `)
    .order('seat_number', { ascending: true });

  if (error) {
    console.error('Error fetching students:', error);
    return [];
  }

  // 각 학생의 출석부 데이터 생성
  const attendanceData = await Promise.all(
    (students || []).map(async (student) => {
      const profile = Array.isArray(student.profiles) 
        ? student.profiles[0] 
        : student.profiles;

      // 학습일 기준 출석 기록
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', student.id)
        .gte('timestamp', todayStart.toISOString())
        .lte('timestamp', todayEnd.toISOString())
        .order('timestamp', { ascending: true });

      // 현재 상태 계산
      let status: 'checked_in' | 'checked_out' | 'on_break' = 'checked_out';
      let firstCheckInTime: string | null = null;
      let lastCheckOutTime: string | null = null;

      if (attendance && attendance.length > 0) {
        // 첫 입실 시간 찾기
        const firstCheckIn = attendance.find(a => a.type === 'check_in');
        if (firstCheckIn) {
          firstCheckInTime = firstCheckIn.timestamp;
        }

        // 마지막 상태 계산
        const lastRecord = attendance[attendance.length - 1];
        if (lastRecord.type === 'check_in') status = 'checked_in';
        else if (lastRecord.type === 'check_out') {
          status = 'checked_out';
          lastCheckOutTime = lastRecord.timestamp;
        }
        else if (lastRecord.type === 'break_start') status = 'on_break';
        else if (lastRecord.type === 'break_end') status = 'checked_in';
      }

      // 오늘 해당하는 부재 스케줄 조회
      const { data: absenceSchedules } = await supabase
        .from('student_absence_schedules')
        .select('*')
        .eq('student_id', student.id)
        .eq('is_active', true);

      // 오늘 적용되는 부재 스케줄 필터링
      const todayAbsenceSchedules = (absenceSchedules || []).filter(schedule => {
        // 유효 기간 체크
        if (schedule.valid_from && todayStr < schedule.valid_from) return false;
        if (schedule.valid_until && todayStr > schedule.valid_until) return false;

        // 일회성 스케줄
        if (!schedule.is_recurring) {
          return schedule.specific_date === todayStr;
        }

        // 반복 스케줄: 요일 체크
        if (schedule.day_of_week && !schedule.day_of_week.includes(todayDayOfWeek)) {
          return false;
        }

        return true;
      });

      // 학습일 기준 몰입도 점수
      const { data: focusScores } = await supabase
        .from('focus_scores')
        .select('score')
        .eq('student_id', student.id)
        .gte('recorded_at', todayStart.toISOString())
        .lte('recorded_at', todayEnd.toISOString());

      const avgFocus = focusScores && focusScores.length > 0
        ? Math.round(focusScores.reduce((sum, f) => sum + f.score, 0) / focusScores.length * 10) / 10
        : null;

      // 오늘 벌점
      const { data: todayPoints } = await supabase
        .from('points')
        .select('type, amount, reason')
        .eq('student_id', student.id)
        .eq('type', 'penalty')
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString());

      const todayPenalty = (todayPoints || []).reduce((sum, p) => sum + p.amount, 0);

      return {
        id: student.id,
        seatNumber: student.seat_number,
        name: profile?.name || '이름 없음',
        status,
        firstCheckInTime,
        lastCheckOutTime,
        absenceSchedules: todayAbsenceSchedules.map(s => ({
          id: s.id,
          title: s.title,
          startTime: s.start_time?.slice(0, 5),
          endTime: s.end_time?.slice(0, 5),
        })),
        avgFocus,
        todayPenalty,
        focusCount: focusScores?.length || 0,
      };
    })
  );

  return attendanceData;
}

// 일괄 몰입도 점수 입력
export async function recordFocusScoreBatch(
  studentIds: string[],
  score: number,
  periodId?: string,
  note?: string
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const inserts = studentIds.map(studentId => ({
    student_id: studentId,
    admin_id: user.id,
    score,
    note,
    period_id: periodId || null,
  }));

  const { error } = await supabase
    .from('focus_scores')
    .insert(inserts);

  if (error) {
    console.error('Error recording batch focus:', error);
    return { error: '일괄 몰입도 기록에 실패했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/focus');
  return { success: true, count: studentIds.length };
}

// 일괄 벌점 부여
export async function givePointsBatch(
  studentIds: string[],
  type: 'reward' | 'penalty',
  amount: number,
  reason: string
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const inserts = studentIds.map(studentId => ({
    student_id: studentId,
    admin_id: user.id,
    type,
    amount,
    reason,
    is_auto: false,
  }));

  const { error } = await supabase
    .from('points')
    .insert(inserts);

  if (error) {
    console.error('Error giving batch points:', error);
    return { error: '일괄 상벌점 부여에 실패했습니다.' };
  }

  // 알림 발송 (비동기로 처리)
  const { createStudentNotification } = await import('./notification');
  for (const studentId of studentIds) {
    createStudentNotification({
      studentId,
      type: 'point',
      title: type === 'penalty' ? '벌점이 부여되었습니다' : '상점이 부여되었습니다',
      message: `${reason} (${type === 'penalty' ? '-' : '+'}${amount}점)`,
      link: '/student/points',
    }).catch(console.error);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  revalidatePath('/admin/focus');
  return { success: true, count: studentIds.length };
}
