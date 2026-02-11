'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
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
export async function getWeeklyFocusReport(branchId?: string | null) {
  const supabase = await createClient();

  // 이번 주 시작일 (DAY_CONFIG 기준)
  const startOfWeek = getWeekStart();

  // 학생 목록
  let query = supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (name, branch_id)
    `)
    .order('seat_number', { ascending: true });

  // 브랜치 필터 적용
  if (branchId) {
    query = query.eq('profiles.branch_id', branchId);
  }

  const { data: students } = await query;

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
export async function getPointsOverview(branchId?: string | null) {
  const supabase = await createClient();

  // 학생 목록
  let query = supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (name, branch_id)
    `)
    .order('seat_number', { ascending: true });

  // 브랜치 필터 적용
  if (branchId) {
    query = query.eq('profiles.branch_id', branchId);
  }

  const { data: students } = await query;

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
export async function getAllPointsHistory(
  filter?: 'reward' | 'penalty' | 'all',
  studentId?: string,
  branchId?: string | null
) {
  const supabase = await createClient();

  // 브랜치 필터가 있으면 해당 브랜치 학생 ID 목록 먼저 조회
  let studentIds: string[] | null = null;
  if (branchId) {
    const { data: branchStudents } = await supabase
      .from('student_profiles')
      .select('id, profiles!inner(branch_id)')
      .eq('profiles.branch_id', branchId);
    studentIds = branchStudents?.map(s => s.id) || [];
  }

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
    .limit(200);

  if (filter && filter !== 'all') {
    query = query.eq('type', filter);
  }

  if (studentId) {
    query = query.eq('student_id', studentId);
  }

  // 브랜치 필터 적용
  if (studentIds !== null) {
    query = query.in('student_id', studentIds);
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

// 상벌점 내역 삭제 (점수 원상복구)
export async function deletePoint(pointId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 삭제 전에 포인트 정보 확인 (알림용)
  const { data: pointData } = await supabase
    .from('points')
    .select(`
      *,
      student:student_id (
        seat_number,
        profiles!inner (name)
      )
    `)
    .eq('id', pointId)
    .single();

  if (!pointData) {
    return { error: '해당 내역을 찾을 수 없습니다.' };
  }

  const { error } = await supabase
    .from('points')
    .delete()
    .eq('id', pointId);

  if (error) {
    console.error('Error deleting point:', error);
    return { error: '상벌점 삭제에 실패했습니다.' };
  }

  // 학생에게 알림 발송
  const { createStudentNotification } = await import('./notification');
  await createStudentNotification({
    studentId: pointData.student_id,
    type: 'point',
    title: pointData.type === 'penalty' ? '벌점이 취소되었습니다' : '상점이 취소되었습니다',
    message: `${pointData.reason} (${pointData.type === 'penalty' ? '-' : '+'}${pointData.amount}점) - 관리자에 의해 취소됨`,
    link: '/student/points',
  }).catch(console.error);

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  return { success: true };
}

// ============================================
// 회원 관리 관련
// ============================================

// 전체 회원 목록 조회 (학생의 경우 seat_number 포함)
export async function getAllMembers(userType?: 'student' | 'parent' | 'admin') {
  const supabase = await createClient();

  // 기본 프로필 조회
  let query = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (userType) {
    query = query.eq('user_type', userType);
  }

  const { data: profiles } = await query;
  if (!profiles) return [];

  // 학생의 경우 student_profiles에서 seat_number 가져오기
  const studentIds = profiles
    .filter(p => p.user_type === 'student')
    .map(p => p.id);

  let seatMap: Record<string, number | null> = {};
  if (studentIds.length > 0) {
    const { data: studentProfiles } = await supabase
      .from('student_profiles')
      .select('id, seat_number')
      .in('id', studentIds);

    if (studentProfiles) {
      seatMap = studentProfiles.reduce((acc, sp) => {
        acc[sp.id] = sp.seat_number;
        return acc;
      }, {} as Record<string, number | null>);
    }
  }

  // 결과 합치기
  return profiles.map(p => ({
    ...p,
    seat_number: p.user_type === 'student' ? (seatMap[p.id] ?? null) : null,
  }));
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
    .update({
      caps_id: normalizedCapsId,
      caps_id_set_at: normalizedCapsId ? new Date().toISOString() : null,
    })
    .eq('id', studentId);

  if (error) {
    console.error('Error updating CAPS ID:', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/members');
  return true;
}

// 회원 정보 수정
export async function updateMember(userId: string, data: { name?: string; phone?: string; school?: string | null; grade?: number | null }) {
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
  // CAPS ID 앞의 0 제거 (예: "0004" -> "4") - CAPS DB의 e_id와 매칭을 위해
  const normalizedCapsId = capsId ? String(parseInt(capsId, 10)) : null;
  
  const { error: studentError } = await supabase
    .from('student_profiles')
    .update({
      caps_id: normalizedCapsId,
      caps_id_set_at: normalizedCapsId ? new Date().toISOString() : null,
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

// 관리자 계정 생성
export async function createAdmin(data: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  branchId?: string;
}) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 현재 사용자가 관리자인지 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (currentProfile?.user_type !== 'admin') {
    return { error: '관리자만 새 관리자를 추가할 수 있습니다.' };
  }

  // 1. Supabase Auth에 사용자 생성 (Admin Client로 RLS 우회)
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true, // 이메일 확인 없이 바로 사용 가능
  });

  if (authError) {
    console.error('Error creating admin auth:', authError);
    if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
      return { error: '이미 등록된 이메일입니다.' };
    }
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: '관리자 계정 생성에 실패했습니다.' };
  }

  const newUserId = authData.user.id;

  // 2. profiles 테이블에 관리자 정보 저장 (Admin Client로 RLS 우회)
  const { error: profileError } = await adminClient.from('profiles').insert({
    id: newUserId,
    email: data.email,
    name: data.name,
    phone: data.phone || null,
    user_type: 'admin',
    branch_id: data.branchId || null,
    is_approved: true, // 관리자는 승인 불필요
  });

  if (profileError) {
    console.error('Error creating admin profile:', profileError);
    // Auth 사용자 롤백
    await adminClient.auth.admin.deleteUser(newUserId);
    return { error: '관리자 프로필 생성에 실패했습니다: ' + profileError.message };
  }

  revalidatePath('/admin/members');
  return { success: true, adminId: newUserId };
}

// 관리자 계정 삭제
export async function deleteAdmin(adminId: string) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 현재 사용자가 관리자인지 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (currentProfile?.user_type !== 'admin') {
    return { error: '관리자만 삭제할 수 있습니다.' };
  }

  // 자기 자신은 삭제할 수 없음
  if (adminId === user.id) {
    return { error: '자기 자신은 삭제할 수 없습니다.' };
  }

  // 삭제 대상이 관리자인지 확인
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('user_type, name')
    .eq('id', adminId)
    .single();

  if (!targetProfile || targetProfile.user_type !== 'admin') {
    return { error: '삭제 대상이 관리자가 아닙니다.' };
  }

  try {
    // 1. profiles 삭제
    const { error: profileError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', adminId);

    if (profileError) {
      console.error('Error deleting admin profile:', profileError);
      return { error: '관리자 정보 삭제에 실패했습니다.' };
    }

    // 2. Auth 사용자 삭제
    const { error: authError } = await adminClient.auth.admin.deleteUser(adminId);

    if (authError) {
      console.error('Error deleting admin auth:', authError);
      return { success: true, warning: 'Auth 사용자 삭제에 실패했습니다. DB 정보는 삭제되었습니다.' };
    }

    revalidatePath('/admin/members');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteAdmin:', error);
    return { error: '관리자 삭제 중 오류가 발생했습니다.' };
  }
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

  // 같은 점수의 비활성(소프트 삭제된) 프리셋이 있는지 확인
  const { data: existing } = await supabase
    .from('focus_score_presets')
    .select('*')
    .eq('branch_id', branchId)
    .eq('score', score)
    .eq('is_active', false)
    .single();

  if (existing) {
    // 비활성 프리셋이 있으면 재활성화 + 라벨/색상 업데이트
    const { data, error } = await supabase
      .from('focus_score_presets')
      .update({ is_active: true, label, color })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Error reactivating focus score preset:', error);
      return { error: '프리셋 생성에 실패했습니다.' };
    }

    revalidatePath('/admin/focus');
    return { success: true, data };
  }

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
export async function getAttendanceBoard(
  targetDate?: string,
  branchId?: string | null,
  page: number = 1,
  pageSize: number = 20
) {
  const supabase = await createClient();

  // 학습일 기준으로 조회 (07:30 ~ 다음날 01:30)
  // targetDate가 전달되면 해당 날짜 사용, 아니면 오늘 날짜
  const studyDate = targetDate 
    ? new Date(targetDate + 'T12:00:00') 
    : getStudyDate();
  const { start: todayStart, end: todayEnd } = getStudyDayBounds(studyDate);
  const todayStr = studyDate.toISOString().split('T')[0];
  const todayDayOfWeek = studyDate.getDay();

  // 페이지네이션 계산
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 학생 프로필 조회 (페이지네이션 적용)
  let query = supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (
        id,
        name,
        email,
        phone,
        branch_id
      )
    `, { count: 'exact' })
    .order('seat_number', { ascending: true });

  // 브랜치 필터 적용
  if (branchId) {
    query = query.eq('profiles.branch_id', branchId);
  }

  const { data: students, error, count } = await query.range(from, to);

  if (error) {
    console.error('Error fetching students:', error);
    return { data: [], total: 0, page, pageSize };
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

  return { data: attendanceData, total: count || 0, page, pageSize };
}

// 주간 출석 데이터 조회 (학생별 7일간 출석 상태)
export async function getWeeklyAttendance(
  weekStartDate: string,
  branchId?: string | null,
  page: number = 1,
  pageSize: number = 20
) {
  const supabase = await createClient();

  // 주 시작일(월요일)부터 7일간의 날짜 배열 생성
  const startDate = new Date(weekStartDate + 'T12:00:00');
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // 페이지네이션 계산
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 학생 프로필 조회 (페이지네이션 적용)
  let query = supabase
    .from('student_profiles')
    .select(`
      id,
      seat_number,
      profiles!inner (
        id,
        name,
        branch_id
      )
    `, { count: 'exact' })
    .order('seat_number', { ascending: true });

  // 브랜치 필터 적용
  if (branchId) {
    query = query.eq('profiles.branch_id', branchId);
  }

  const { data: students, error, count } = await query.range(from, to);

  if (error) {
    console.error('Error fetching students:', error);
    return { students: [], dates: [], total: 0, page, pageSize };
  }

  // 주간 전체 기간의 시작/종료 시간
  const weekStart = getStudyDayBounds(dates[0]).start;
  const weekEnd = getStudyDayBounds(dates[6]).end;

  // 해당 기간의 모든 출석 기록 조회
  const studentIds = (students || []).map(s => s.id);
  const { data: allAttendance } = await supabase
    .from('attendance')
    .select('*')
    .in('student_id', studentIds)
    .gte('timestamp', weekStart.toISOString())
    .lte('timestamp', weekEnd.toISOString())
    .order('timestamp', { ascending: true });

  // 각 학생별 주간 데이터 생성
  const weeklyData = (students || []).map((student) => {
    const profile = Array.isArray(student.profiles) 
      ? student.profiles[0] 
      : student.profiles;

    // 각 날짜별 출석 상태 계산
    const dailyStatus: Record<string, { 
      status: 'attended' | 'not_attended' | 'on_break' | null;
      checkInTime: string | null;
    }> = {};

    dates.forEach(dateStr => {
      const { start: dayStart, end: dayEnd } = getStudyDayBounds(dateStr);
      
      // 해당 날짜의 출석 기록 필터링
      const dayAttendance = (allAttendance || []).filter(a => 
        a.student_id === student.id &&
        new Date(a.timestamp) >= dayStart &&
        new Date(a.timestamp) <= dayEnd
      );

      if (dayAttendance.length === 0) {
        // 미래 날짜인 경우 null, 과거 날짜인 경우 not_attended
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(dateStr + 'T12:00:00');
        checkDate.setHours(0, 0, 0, 0);
        
        dailyStatus[dateStr] = {
          status: checkDate > today ? null : 'not_attended',
          checkInTime: null,
        };
      } else {
        // 첫 입실 시간
        const firstCheckIn = dayAttendance.find(a => a.type === 'check_in');
        
        // 입실 기록이 있으면 attended
        dailyStatus[dateStr] = {
          status: firstCheckIn ? 'attended' : 'not_attended',
          checkInTime: firstCheckIn?.timestamp || null,
        };
      }
    });

    return {
      id: student.id,
      seatNumber: student.seat_number,
      name: profile?.name || '이름 없음',
      dailyStatus,
    };
  });

  return {
    students: weeklyData,
    dates,
    total: count || 0,
    page,
    pageSize,
  };
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

// 오늘 교시별 몰입도 데이터 조회
export async function getTodayFocusScoresByPeriod(branchId?: string | null) {
  const supabase = await createClient();

  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  // 브랜치 필터가 있으면 해당 브랜치 학생 ID 목록 먼저 조회
  let studentIds: string[] | null = null;
  if (branchId) {
    const { data: branchStudents } = await supabase
      .from('student_profiles')
      .select('id, profiles!inner(branch_id)')
      .eq('profiles.branch_id', branchId);
    studentIds = branchStudents?.map(s => s.id) || [];
  }

  let query = supabase
    .from('focus_scores')
    .select('id, student_id, period_id, score, note')
    .gte('recorded_at', start.toISOString())
    .lte('recorded_at', end.toISOString());

  // 브랜치 필터 적용
  if (studentIds !== null) {
    query = query.in('student_id', studentIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching today focus scores:', error);
    return {};
  }

  // { [studentId]: { [periodId]: { score, note, id } } }
  const result: Record<string, Record<string, { score: number; note: string | null; id: string }>> = {};
  for (const row of data || []) {
    if (!row.student_id || !row.period_id) continue;
    if (!result[row.student_id]) result[row.student_id] = {};
    result[row.student_id][row.period_id] = {
      score: row.score,
      note: row.note,
      id: row.id,
    };
  }

  return result;
}

// 개별 학생-교시 몰입도 upsert
export async function recordFocusScoreIndividual(
  studentId: string,
  periodId: string,
  score: number,
  note?: string
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  // 오늘 해당 학생-교시에 기존 기록이 있는지 확인
  const { data: existing } = await supabase
    .from('focus_scores')
    .select('id')
    .eq('student_id', studentId)
    .eq('period_id', periodId)
    .gte('recorded_at', start.toISOString())
    .lte('recorded_at', end.toISOString())
    .limit(1)
    .maybeSingle();

  if (existing) {
    // 업데이트
    const { error } = await supabase
      .from('focus_scores')
      .update({ score, note: note || null, admin_id: user.id })
      .eq('id', existing.id);

    if (error) {
      console.error('Error updating focus score:', error);
      return { error: '몰입도 수정에 실패했습니다.' };
    }
  } else {
    // 삽입
    const { error } = await supabase
      .from('focus_scores')
      .insert({
        student_id: studentId,
        admin_id: user.id,
        score,
        note: note || null,
        period_id: periodId,
      });

    if (error) {
      console.error('Error inserting focus score:', error);
      return { error: '몰입도 기록에 실패했습니다.' };
    }
  }

  revalidatePath('/admin');
  revalidatePath('/admin/focus');
  return { success: true };
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

// ============================================
// 회원 탈퇴 관련
// ============================================

// 회원 탈퇴 (학생/학부모)
export async function deleteMember(userId: string, userType: 'student' | 'parent') {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 현재 로그인한 사용자가 관리자인지 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (adminProfile?.user_type !== 'admin') {
    return { error: '관리자만 회원을 탈퇴시킬 수 있습니다.' };
  }

  try {
    // 1. NO ACTION FK 테이블 처리 (학생인 경우)
    if (userType === 'student') {
      // student_profiles에서 student_id 조회
      const { data: studentProfile } = await adminClient
        .from('student_profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (studentProfile) {
        // notifications.student_id → NULL로 설정
        await adminClient
          .from('notifications')
          .update({ student_id: null })
          .eq('student_id', studentProfile.id);

        // chat_messages.sender_id → NULL로 설정
        await adminClient
          .from('chat_messages')
          .update({ sender_id: null })
          .eq('sender_id', userId);
      }
    }

    // 2. profiles 삭제 (CASCADE로 student_profiles/parent_profiles 및 관련 데이터 자동 삭제)
    const { error: deleteError } = await adminClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      console.error('Error deleting profile:', deleteError);
      return { error: '회원 정보 삭제에 실패했습니다.' };
    }

    // 3. Supabase Auth에서 사용자 삭제
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Error deleting auth user:', authError);
      // DB에서는 삭제되었으므로 경고만 반환
      return { success: true, warning: 'Auth 사용자 삭제에 실패했습니다. DB 정보는 삭제되었습니다.' };
    }

    revalidatePath('/admin');
    revalidatePath('/admin/members');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteMember:', error);
    return { error: '회원 탈퇴 처리 중 오류가 발생했습니다.' };
  }
}
