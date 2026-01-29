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
export async function recordFocusScore(studentId: string, score: number, note?: string) {
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

// 학생 상세 정보 조회
export async function getStudentDetail(studentId: string) {
  const supabase = await createClient();

  const { data: student } = await supabase
    .from('student_profiles')
    .select(`
      *,
      profiles!inner (*)
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
    name: profile?.name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    createdAt: profile?.created_at || '',
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

  const { error } = await supabase
    .from('student_profiles')
    .update({ caps_id: capsId || null })
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
