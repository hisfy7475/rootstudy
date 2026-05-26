'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { revalidatePath } from 'next/cache';
import { escapeLike } from '@/lib/list-params';
import { softDeleteUser } from '@/lib/withdraw';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import {
  getStudyDate,
  getStudyDayBounds,
  getWeekStart,
  getCalendarWeekBoundsKST,
  getWeekDateStringsFromMondayKST,
  getTodayKST,
  formatDateKST,
} from '@/lib/utils';
import { DAY_CONFIG } from '@/lib/constants';
import { extractStudySessions } from '@/lib/study-time';

function groupById<T extends { student_id: string }>(items: T[]): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.student_id]) acc[item.student_id] = [];
      acc[item.student_id].push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

// 단계 5: 벌점 삭제·취소 후 분기 누적이 30점 미만으로 떨어지면 검토 취소 + 상점 복구.
// withdrawal_review_at 이 같은 분기에 세팅돼 있을 때만 동작.
async function maybeRevertWithdrawalReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
): Promise<void> {
  const { getCurrentQuarterStartKST } = await import('@/lib/utils');
  const quarterStart = getCurrentQuarterStartKST();

  const [{ data: profile }, { data: penalties }] = await Promise.all([
    supabase
      .from('student_profiles')
      .select('withdrawal_review_at, threshold_consumed_in_quarter_at')
      .eq('id', studentId)
      .maybeSingle(),
    supabase
      .from('points')
      .select('amount')
      .eq('student_id', studentId)
      .eq('type', 'penalty')
      .gte('created_at', quarterStart.toISOString()),
  ]);

  if (!profile?.withdrawal_review_at) return;
  const consumedAt = profile.threshold_consumed_in_quarter_at;
  if (!consumedAt || new Date(consumedAt) < quarterStart) return;

  const quarterTotal = (penalties ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
  if (quarterTotal >= 30) return;

  await supabase.rpc('cancel_withdrawal_review', {
    p_student_id: studentId,
    p_restore_reward: true,
  });
}

/** 교시 HH:MM(:SS)를 해당 학습일(KST) 상의 절대 시각으로 변환 (새벽 시간은 다음날 달력으로 보정) */
function kstInstantOnStudyDay(dateStr: string, timeHHMM: string): Date {
  const raw = timeHHMM.trim();
  const parts = raw.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  const sec = parseInt(parts[2] ?? '0', 10);
  const timePart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  const candidate = new Date(`${dateStr}T${timePart}+09:00`);
  const studyDayStartKst = new Date(
    `${dateStr}T${String(DAY_CONFIG.startHour).padStart(2, '0')}:${String(DAY_CONFIG.startMinute).padStart(2, '0')}:00+09:00`,
  );
  if (candidate.getTime() < studyDayStartKst.getTime()) {
    return new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidate;
}

type StudySessionFocus = { startTime: Date; endTime: Date };

/** attendance 이벤트에서 학습 세션 구간 추출 (미퇴실 시 학습일 종료 또는 현재 시각까지) */
function extractStudySessionsForFocusDay(
  attendance: Array<{ type: string; timestamp: string }>,
  studyDayEnd: Date,
): StudySessionFocus[] {
  const sessions: StudySessionFocus[] = [];
  let checkInTime: Date | null = null;
  const now = new Date();
  const cap = now.getTime() < studyDayEnd.getTime() ? now : studyDayEnd;

  for (const record of attendance) {
    const timestamp = new Date(record.timestamp);
    switch (record.type) {
      case 'check_in':
        checkInTime = timestamp;
        break;
      case 'check_out':
      case 'break_start':
        if (checkInTime) {
          sessions.push({ startTime: checkInTime, endTime: timestamp });
          checkInTime = null;
        }
        break;
      case 'break_end':
        checkInTime = timestamp;
        break;
    }
  }

  if (checkInTime && cap.getTime() > checkInTime.getTime()) {
    sessions.push({ startTime: checkInTime, endTime: cap });
  }

  return sessions;
}

function sessionOverlapsSlot(session: StudySessionFocus, slotStart: Date, slotEnd: Date): boolean {
  const overlapStart = Math.max(session.startTime.getTime(), slotStart.getTime());
  const overlapEnd = Math.min(session.endTime.getTime(), slotEnd.getTime());
  return overlapEnd > overlapStart;
}

/**
 * 특정 학습일·교시 시간대에 1초라도 재실(학습 세션)이었던 학생 목록
 */
export async function getStudentsPresentDuringPeriod(
  dateStr: string,
  periodStartTime: string,
  periodEndTime: string,
  branchId: string | null,
): Promise<{ id: string; name: string; seatNumber: number | null }[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // branchId === null 은 슈퍼관리자의 "전 지점" 신호. 일반 어드민이 branchId 없이 들어오면
  // 페이지 단계에서 차단되므로 여기서 별도 가드는 하지 않는다.
  let studentsQuery = supabase
    .from('student_profiles')
    .select(
      `
      id,
      seat_number,
      profiles!inner (
        id,
        name,
        branch_id
      )
    `,
    )
    .is('profiles.withdrawn_at', null)
    .order('seat_number', { ascending: true });
  if (branchId) studentsQuery = studentsQuery.eq('profiles.branch_id', branchId);

  const { data: students, error: studentsError } = await studentsQuery;
  if (studentsError || !students?.length) return [];

  const studentIds = students.map((s) => s.id);
  const { start: dayStart, end: dayEnd } = getStudyDayBounds(dateStr);

  type AttendanceRecord = { student_id: string; type: string; timestamp: string };
  let allAttendance: AttendanceRecord[] = [];
  {
    const baseQuery = () =>
      supabase
        .from('attendance')
        .select('student_id, type, timestamp')
        .in('student_id', studentIds)
        .gte('timestamp', dayStart.toISOString())
        .lte('timestamp', dayEnd.toISOString())
        .order('timestamp', { ascending: true });
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await baseQuery().range(from, from + PAGE - 1);
      if (!data?.length) break;
      allAttendance = allAttendance.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const attendanceByStudent = groupById(allAttendance);
  const slotStart = kstInstantOnStudyDay(dateStr, periodStartTime);
  let slotEnd = kstInstantOnStudyDay(dateStr, periodEndTime);
  if (slotEnd.getTime() <= slotStart.getTime()) {
    slotEnd = new Date(slotEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  const present: { id: string; name: string; seatNumber: number | null }[] = [];

  for (const row of students) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile?.name) continue;

    const events = attendanceByStudent[row.id] ?? [];
    const sessions = extractStudySessionsForFocusDay(events, dayEnd);
    const wasPresent = sessions.some((s) => sessionOverlapsSlot(s, slotStart, slotEnd));
    if (wasPresent) {
      present.push({
        id: row.id,
        name: profile.name,
        seatNumber: row.seat_number,
      });
    }
  }

  return present;
}

// ============================================
// 학생 현황 관련
// ============================================

// 전체 학생 목록 조회 (현황 포함)
export async function getAllStudents(
  statusFilter?: 'all' | 'checked_in' | 'checked_out' | 'on_break',
  branchId?: string | null,
) {
  const supabase = await createClient();

  // 학생 프로필 조회 — 퇴원생 제외
  let studentsQuery = supabase
    .from('student_profiles')
    .select(
      `
      id,
      seat_number,
      profiles!inner (
        id,
        name,
        email,
        phone,
        branch_id
      )
    `,
    )
    .is('profiles.withdrawn_at', null)
    .order('seat_number', { ascending: true });

  if (branchId) {
    studentsQuery = studentsQuery.eq('profiles.branch_id', branchId);
  }

  const { data: students, error } = await studentsQuery;

  if (error) {
    console.error('Error fetching students:', error);
    return [];
  }

  if (!students || students.length === 0) return [];

  const studentIds = students.map((s) => s.id);
  const studyDate = getStudyDate();
  const { start: todayStart, end: todayEnd } = getStudyDayBounds(studyDate);

  // Supabase max-rows(1000) 제한 우회 페이지네이션
  type AttendanceRecord = { student_id: string; type: string; timestamp: string };
  let allAttendance: AttendanceRecord[] = [];
  {
    const baseQuery = () =>
      supabase
        .from('attendance')
        .select('student_id, type, timestamp')
        .in('student_id', studentIds)
        .gte('timestamp', todayStart.toISOString())
        .lte('timestamp', todayEnd.toISOString())
        .order('timestamp', { ascending: true });
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await baseQuery().range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allAttendance = allAttendance.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  // 배치 쿼리: 나머지 데이터 조회
  const [{ data: allSubjects }, { data: allFocusScores }, { data: allPoints }] = await Promise.all([
    supabase
      .from('subjects')
      .select('student_id, subject_name')
      .in('student_id', studentIds)
      .eq('is_current', true),
    supabase
      .from('focus_scores')
      .select('student_id, score')
      .in('student_id', studentIds)
      .gte('recorded_at', todayStart.toISOString())
      .lte('recorded_at', todayEnd.toISOString()),
    supabase
      .from('points')
      .select('student_id, type, amount')
      .in('student_id', studentIds)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString()),
  ]);

  // 학생별로 그룹핑
  const attendanceByStudent = groupById(allAttendance ?? []);
  const subjectByStudent: Record<string, string | null> = {};
  for (const s of allSubjects ?? []) {
    subjectByStudent[s.student_id] = s.subject_name;
  }
  const focusByStudent = groupById(allFocusScores ?? []);
  const pointsByStudent = groupById(allPoints ?? []);

  // 메모리에서 각 학생 데이터 조합
  const studentsWithStatus = students.map((student) => {
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;

    const attendance = attendanceByStudent[student.id] ?? [];

    let status: 'checked_in' | 'checked_out' | 'on_break' = 'checked_out';
    let checkInTime: string | null = null;
    let totalStudySeconds = 0;

    if (attendance.length > 0) {
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
              totalStudySeconds += Math.floor(
                (timestamp.getTime() - tempCheckInTime.getTime()) / 1000,
              );
              tempCheckInTime = null;
            }
            status = 'checked_out';
            break;
          case 'break_start':
            if (tempCheckInTime) {
              totalStudySeconds += Math.floor(
                (timestamp.getTime() - tempCheckInTime.getTime()) / 1000,
              );
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

      if (tempCheckInTime) {
        totalStudySeconds += Math.floor((new Date().getTime() - tempCheckInTime.getTime()) / 1000);
        checkInTime = tempCheckInTime.toISOString();
      }

      const firstCheckIn = attendance.find((a) => a.type === 'check_in');
      if (firstCheckIn) {
        checkInTime = firstCheckIn.timestamp;
      }
    }

    const focusScores = focusByStudent[student.id] ?? [];
    const avgFocus =
      focusScores.length > 0
        ? Math.round((focusScores.reduce((sum, f) => sum + f.score, 0) / focusScores.length) * 10) /
          10
        : null;

    const todayPoints = pointsByStudent[student.id] ?? [];
    const todayReward = todayPoints
      .filter((p) => p.type === 'reward')
      .reduce((sum, p) => sum + p.amount, 0);
    const todayPenalty = todayPoints
      .filter((p) => p.type === 'penalty')
      .reduce((sum, p) => sum + p.amount, 0);

    const currentSubject = status === 'checked_in' ? (subjectByStudent[student.id] ?? null) : null;

    return {
      id: student.id,
      seatNumber: student.seat_number,
      name: profile?.name || '이름 없음',
      email: profile?.email || '',
      phone: profile?.phone || '',
      status,
      checkInTime,
      totalStudySeconds,
      currentSubject,
      avgFocus,
      todayReward,
      todayPenalty,
    };
  });

  // 필터 적용
  if (statusFilter && statusFilter !== 'all') {
    return studentsWithStatus.filter((s) => s.status === statusFilter);
  }

  return studentsWithStatus;
}

// dashboard 페이지 전용. URL-first 검색·페이지네이션·정렬 + count_attendance_status RPC 기반 stats.
// stats 는 검색·status 와 무관하게 branch 전체 기준 (기존 클라 동작과 동일 의미론).
// status 필터는 attendance 기반 계산이 필요해 SQL 단계에서 자르지 못하므로,
// status 가 있을 때만 검색 결과를 모두 받아 메모리에서 필터링 후 페이지 슬라이싱.
export async function getDashboardStudents(params: {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: 'seat_number' | 'name';
  dir?: 'asc' | 'desc';
  status?: 'checked_in' | 'checked_out' | 'on_break';
  branchId?: string | null;
}): Promise<{
  rows: Array<{
    id: string;
    seatNumber: number | null;
    name: string;
    email: string;
    phone: string;
    status: 'checked_in' | 'checked_out' | 'on_break';
    checkInTime: string | null;
    totalStudySeconds: number;
    currentSubject: string | null;
    avgFocus: number | null;
    todayReward: number;
    todayPenalty: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
  stats: {
    total: number;
    checkedIn: number;
    checkedOut: number;
    onBreak: number;
    notYetArrived: number;
  };
}> {
  const supabase = await createClient();
  const q = params.q?.trim() || '';
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 50;
  const sort = params.sort ?? 'seat_number';
  const dir = params.dir ?? 'asc';
  const status = params.status;
  const branchId = params.branchId ?? null;

  const studyDate = getStudyDate();
  const { start: todayStart, end: todayEnd } = getStudyDayBounds(studyDate);

  // 1) stats — RPC 호출. branchId === null 은 슈퍼관리자의 "전 지점" 신호 (RPC 가 전체 반환).
  let stats = { total: 0, checkedIn: 0, checkedOut: 0, onBreak: 0, notYetArrived: 0 };
  {
    const { data: rpc, error: statsErr } = await supabase.rpc('count_attendance_status', {
      p_branch_id: branchId,
      p_target_date: formatDateKST(studyDate),
    });
    if (statsErr) console.error('count_attendance_status error:', statsErr);
    if (rpc && rpc.length > 0) {
      const r = rpc[0] as {
        checked_in: number;
        checked_out: number;
        on_break: number;
        not_yet_arrived: number;
        total: number;
      };
      stats = {
        total: r.total ?? 0,
        checkedIn: r.checked_in ?? 0,
        checkedOut: r.checked_out ?? 0,
        onBreak: r.on_break ?? 0,
        notYetArrived: r.not_yet_arrived ?? 0,
      };
    }
  }

  // 2) 학생 검색·정렬 쿼리 — 퇴원생 제외
  let listQuery = supabase
    .from('student_profiles')
    .select(
      `
      id,
      seat_number,
      profiles!inner (
        id,
        name,
        email,
        phone,
        branch_id
      )
    `,
      { count: 'exact' },
    )
    .is('profiles.withdrawn_at', null);

  if (branchId) listQuery = listQuery.eq('profiles.branch_id', branchId);
  if (q) {
    if (/^\d+$/.test(q)) {
      // 숫자만 입력된 경우 좌석번호 정확 매칭
      listQuery = listQuery.eq('seat_number', Number.parseInt(q, 10));
    } else {
      listQuery = listQuery.ilike('profiles.name', `%${escapeLike(q)}%`);
    }
  }

  const ascending = dir === 'asc';
  if (sort === 'name') {
    listQuery = listQuery.order('name', { foreignTable: 'profiles', ascending });
  } else {
    listQuery = listQuery.order('seat_number', { ascending });
  }

  // status 없으면 SQL range 페이지네이션. 있으면 전체 받아 후처리.
  if (!status) {
    const offset = (page - 1) * pageSize;
    listQuery = listQuery.range(offset, offset + pageSize - 1);
  }

  const { data: students, count, error } = await listQuery;
  if (error || !students) {
    console.error('Error fetching dashboard students:', error);
    return { rows: [], total: 0, page, pageSize, stats };
  }

  if (students.length === 0) {
    return { rows: [], total: count ?? 0, page, pageSize, stats };
  }

  const studentIds = students.map((s) => s.id);

  // 3) 보조 데이터 — 검색된 학생 ID로만
  type AttendanceRecord = { student_id: string; type: string; timestamp: string };
  let allAttendance: AttendanceRecord[] = [];
  {
    const baseQuery = () =>
      supabase
        .from('attendance')
        .select('student_id, type, timestamp')
        .in('student_id', studentIds)
        .gte('timestamp', todayStart.toISOString())
        .lte('timestamp', todayEnd.toISOString())
        .order('timestamp', { ascending: true });
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await baseQuery().range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allAttendance = allAttendance.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const [{ data: allSubjects }, { data: allFocusScores }, { data: allPoints }] = await Promise.all([
    supabase
      .from('subjects')
      .select('student_id, subject_name')
      .in('student_id', studentIds)
      .eq('is_current', true),
    supabase
      .from('focus_scores')
      .select('student_id, score')
      .in('student_id', studentIds)
      .gte('recorded_at', todayStart.toISOString())
      .lte('recorded_at', todayEnd.toISOString()),
    supabase
      .from('points')
      .select('student_id, type, amount')
      .in('student_id', studentIds)
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString()),
  ]);

  const attendanceByStudent = groupById(allAttendance ?? []);
  const subjectByStudent: Record<string, string | null> = {};
  for (const s of allSubjects ?? []) subjectByStudent[s.student_id] = s.subject_name;
  const focusByStudent = groupById(allFocusScores ?? []);
  const pointsByStudent = groupById(allPoints ?? []);

  const computed = students.map((student) => {
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    const attendance = attendanceByStudent[student.id] ?? [];

    let s: 'checked_in' | 'checked_out' | 'on_break' = 'checked_out';
    let checkInTime: string | null = null;
    let totalStudySeconds = 0;

    if (attendance.length > 0) {
      let tempCheckInTime: Date | null = null;
      for (const record of attendance) {
        const timestamp = new Date(record.timestamp);
        switch (record.type) {
          case 'check_in':
            tempCheckInTime = timestamp;
            s = 'checked_in';
            break;
          case 'check_out':
            if (tempCheckInTime) {
              totalStudySeconds += Math.floor(
                (timestamp.getTime() - tempCheckInTime.getTime()) / 1000,
              );
              tempCheckInTime = null;
            }
            s = 'checked_out';
            break;
          case 'break_start':
            if (tempCheckInTime) {
              totalStudySeconds += Math.floor(
                (timestamp.getTime() - tempCheckInTime.getTime()) / 1000,
              );
              tempCheckInTime = null;
            }
            s = 'on_break';
            break;
          case 'break_end':
            tempCheckInTime = timestamp;
            s = 'checked_in';
            break;
        }
      }
      if (tempCheckInTime) {
        totalStudySeconds += Math.floor((new Date().getTime() - tempCheckInTime.getTime()) / 1000);
        checkInTime = tempCheckInTime.toISOString();
      }
      const firstCheckIn = attendance.find((a) => a.type === 'check_in');
      if (firstCheckIn) checkInTime = firstCheckIn.timestamp;
    }

    const focusScores = focusByStudent[student.id] ?? [];
    const avgFocus =
      focusScores.length > 0
        ? Math.round((focusScores.reduce((sum, f) => sum + f.score, 0) / focusScores.length) * 10) /
          10
        : null;
    const todayPoints = pointsByStudent[student.id] ?? [];
    const todayReward = todayPoints
      .filter((p) => p.type === 'reward')
      .reduce((sum, p) => sum + p.amount, 0);
    const todayPenalty = todayPoints
      .filter((p) => p.type === 'penalty')
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      id: student.id,
      seatNumber: student.seat_number,
      name: profile?.name || '이름 없음',
      email: profile?.email || '',
      phone: profile?.phone || '',
      status: s,
      checkInTime,
      totalStudySeconds,
      currentSubject: s === 'checked_in' ? (subjectByStudent[student.id] ?? null) : null,
      avgFocus,
      todayReward,
      todayPenalty,
    };
  });

  if (status) {
    const filtered = computed.filter((c) => c.status === status);
    const total = filtered.length;
    const offset = (page - 1) * pageSize;
    return {
      rows: filtered.slice(offset, offset + pageSize),
      total,
      page,
      pageSize,
      stats,
    };
  }

  return {
    rows: computed,
    total: count ?? computed.length,
    page,
    pageSize,
    stats,
  };
}

// 학생 과목 설정 (관리자가 직접). subjectName이 null이면 현재 과목만 종료(선택 해제)
export async function setStudentSubject(studentId: string, subjectName: string | null) {
  const supabase = await createClient();

  // 학습일 기준으로 조회
  const studyDate = getStudyDate();
  const { start: todayStart, end: todayEnd } = getStudyDayBounds(studyDate);

  // 학생의 입실 상태 확인
  const { data: lastAttendance } = await supabase
    .from('attendance')
    .select('type')
    .eq('student_id', studentId)
    .gte('timestamp', todayStart.toISOString())
    .lte('timestamp', todayEnd.toISOString())
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  // 입실 상태(check_in 또는 break_end)가 아니면 과목 설정 거부
  if (lastAttendance?.type !== 'check_in' && lastAttendance?.type !== 'break_end') {
    return { error: '입실 상태인 학생에게만 과목을 설정할 수 있습니다.' };
  }

  // 현재 과목 종료
  await supabase
    .from('subjects')
    .update({ is_current: false, ended_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('is_current', true);

  if (subjectName === null || subjectName === '') {
    return { success: true };
  }

  // 새 과목 시작
  const { error } = await supabase.from('subjects').insert({
    student_id: studentId,
    subject_name: subjectName,
    is_current: true,
  });

  if (error) {
    console.error('Error setting subject:', error);
    return { error: '과목 설정에 실패했습니다.' };
  }

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
  periodId?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('focus_scores').insert({
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
export async function getStudentFocusHistory(
  studentId: string,
  startDate: string,
  endDate: string,
) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('focus_scores')
    .select(
      `
      *,
      profiles:admin_id (name)
    `,
    )
    .eq('student_id', studentId)
    .gte('recorded_at', startDate)
    .lte('recorded_at', endDate)
    .order('recorded_at', { ascending: false });

  return data || [];
}

// 전체 몰입도 리포트 (주간) - DAY_CONFIG.weekStartsOn 기준
// 주간 몰입도 리포트 — focus_weekly_summary RPC 로 단일 SQL 집계.
// dailyScores(원시 점수 배열)는 더 이상 노출하지 않고 클라이언트가 필요로 하는
// 일별 평균만 반환한다. branch 격리는 RPC 의 admin/branch 가드가 보장.
export interface WeeklyFocusReport {
  id: string;
  seatNumber: number | null;
  name: string;
  dailyAvg: { [date: string]: { avg: number; count: number } };
  weeklyAvg: number | null;
}

export async function getWeeklyFocusReport(branchId?: string | null): Promise<WeeklyFocusReport[]> {
  const supabase = await createClient();
  if (!branchId) return [];

  // KST 월요일을 RPC 의 p_week_start 인자(YYYY-MM-DD)로 사용.
  const mondayStr = formatDateKST(getWeekStart());
  const dateKeys = getWeekDateStringsFromMondayKST(mondayStr); // 0=월 ... 6=일

  // 학생 명단 (좌석순) — 퇴원생 제외
  const { data: students } = await supabase
    .from('student_profiles')
    .select('id, seat_number, profiles!inner (name, branch_id)')
    .eq('profiles.branch_id', branchId)
    .is('profiles.withdrawn_at', null)
    .order('seat_number', { ascending: true });

  if (!students || students.length === 0) return [];

  const { data: summary, error } = await supabase.rpc('focus_weekly_summary', {
    p_branch_id: branchId,
    p_week_start: mondayStr,
  });
  if (error) {
    console.error('[getWeeklyFocusReport]', error);
    return [];
  }

  type Cell = { avg: number; count: number; sum: number };
  const byStudent = new Map<string, Map<number, Cell>>();
  for (const row of summary ?? []) {
    let map = byStudent.get(row.student_id);
    if (!map) {
      map = new Map();
      byStudent.set(row.student_id, map);
    }
    map.set(row.day_index, {
      avg: Number(row.avg_score),
      count: row.count,
      sum: Number(row.total_score),
    });
  }

  return students.map((student) => {
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    const cells = byStudent.get(student.id);
    const dailyAvg: { [date: string]: { avg: number; count: number } } = {};
    let weeklySum = 0;
    let weeklyCount = 0;
    if (cells) {
      for (const [idx, c] of cells) {
        if (idx < 0 || idx > 6) continue;
        dailyAvg[dateKeys[idx]] = { avg: c.avg, count: c.count };
        weeklySum += c.sum;
        weeklyCount += c.count;
      }
    }
    return {
      id: student.id,
      seatNumber: student.seat_number,
      name: profile?.name || '이름 없음',
      dailyAvg,
      weeklyAvg: weeklyCount > 0 ? Math.round((weeklySum / weeklyCount) * 10) / 10 : null,
    };
  });
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
  isAuto: boolean = false,
  presetId: string | null = null,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 슈퍼관리자가 부여하는 케이스: client 가 전 지점 preset 합집합에서 첫 매칭 ID 를 보내
  // 학생의 실제 지점 preset 과 다를 수 있다 (같은 이름의 preset 이 여러 지점에 존재).
  // 이 경우 unique index 가 student × preset 단위라 잘못된 preset 으로 들어가면 중복 차단이
  // 사실상 우회된다. 학생 branch 의 preset 으로 재매칭한다.
  let effectivePresetId = presetId;
  let effectivePresetType: 'reward' | 'penalty' | null = presetId ? type : null;
  if (effectivePresetId) {
    const { data: studentProfile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', studentId)
      .maybeSingle();
    const branchId = (studentProfile?.branch_id as string | null) ?? null;
    if (branchId) {
      const tableName = type === 'reward' ? 'reward_presets' : 'penalty_presets';
      const { data: preset } = await supabase
        .from(tableName)
        .select('id, branch_id')
        .eq('id', effectivePresetId)
        .maybeSingle();
      if (!preset || (preset.branch_id as string) !== branchId) {
        // mismatch — 학생 branch 의 동일 reason preset 으로 재매칭
        const { data: matched } = await supabase
          .from(tableName)
          .select('id')
          .eq('branch_id', branchId)
          .eq('reason', reason)
          .eq('is_active', true)
          .maybeSingle();
        effectivePresetId = (matched?.id as string | undefined) ?? null;
        effectivePresetType = effectivePresetId ? type : null;
      }
    }
  }

  // 단계 8: 벌점은 RPC give_penalty_with_threshold_check 로 처리.
  //   - 임계치 hook (10/20/25/30) + 단계 알림 dedupe + 30점 도달 시 handle_penalty_threshold
  //   - 모두 단일 트랜잭션 (CAS + 락)
  // 상점은 기존 INSERT 유지.
  type ThresholdResult =
    | {
        status: 'consumed';
        balance_before: number;
        auto_pending_created: number;
        remainder_burnt: number;
      }
    | { status: 'already_consumed_this_quarter' };
  let warnings: Array<'warn_10' | 'warn_20' | 'warn_25'> = [];
  let thresholdResult: ThresholdResult | null = null;

  if (type === 'penalty') {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'give_penalty_with_threshold_check',
      {
        p_student_id: studentId,
        p_admin_id: user.id,
        p_amount: amount,
        p_reason: reason,
        p_preset_id: effectivePresetId,
        p_event_kind: isAuto
          ? reason === '지각'
            ? 'auto_late'
            : reason === '조기퇴실'
              ? 'auto_early'
              : 'auto_weekly'
          : 'manual',
      },
    );

    if (rpcError) {
      if ((rpcError as { code?: string }).code === '23505') {
        return { error: '오늘 이미 같은 항목으로 부여됐습니다.' };
      }
      console.error('give_penalty_with_threshold_check error:', rpcError);
      return { error: '벌점 부여에 실패했습니다.' };
    }
    const result = rpcData as {
      warnings: Array<'warn_10' | 'warn_20' | 'warn_25'>;
      threshold: ThresholdResult | null;
    };
    warnings = result.warnings ?? [];
    thresholdResult = result.threshold;
  } else {
    // 상점은 기존 단순 INSERT (event_kind='manual' 또는 auto_daily_focus 등은 cron 측에서 직접 INSERT)
    const { error } = await supabase.from('points').insert({
      student_id: studentId,
      admin_id: user.id,
      type,
      amount,
      reason,
      is_auto: isAuto,
      preset_id: effectivePresetId,
      preset_type: effectivePresetType,
      event_kind: isAuto ? 'auto_weekly' : 'manual',
    });
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return { error: '오늘 이미 같은 항목으로 부여됐습니다.' };
      }
      console.error('Error giving points:', error);
      return { error: '상벌점 부여에 실패했습니다.' };
    }
  }

  // 학생에게 알림 발송 (자동 부여가 아닌 경우만 - 자동은 student.ts에서 처리)
  if (!isAuto) {
    const {
      createStudentNotification,
      notifyPointsGranted,
      // [알림톡 비활성화 2026-05-26]
      // sendKakaoAlimtalkToParent,
      // sendKakaoAlimtalkToParentCritical,
    } = await import('./notification');
    await notifyPointsGranted({ studentId, type, amount, reason }).catch(console.error);

    // [알림톡 비활성화 2026-05-26] 학부모 알림톡 — dedupe 매트릭스(G 섹션):
    //   매 벌점마다 알림톡 발송하지 않고, 단계 알림(warn_25/30 reached) 또는 상점만.
    //   상점은 매번 알림톡, 벌점은 25점/30점 도달 시점에 통합 알림톡 1회.
    //   25/30 은 critical → 실패 시 큐 enqueue (백로그 6).
    // const shouldSendKakao =
    //   type === 'reward' || warnings.includes('warn_25') || thresholdResult?.status === 'consumed';
    // const isCritical = warnings.includes('warn_25') || thresholdResult?.status === 'consumed';
    //
    // if (shouldSendKakao) {
    //   try {
    //     const { data: studentProfile } = await supabase
    //       .from('profiles')
    //       .select('name')
    //       .eq('id', studentId)
    //       .single();
    //
    //     const { data: parentLink } = await supabase
    //       .from('parent_student_links')
    //       .select('parent_id')
    //       .eq('student_id', studentId)
    //       .limit(1)
    //       .maybeSingle();
    //
    //     if (parentLink?.parent_id && studentProfile?.name) {
    //       let alimtalkMessage: string;
    //       if (thresholdResult?.status === 'consumed') {
    //         const burnt = thresholdResult.remainder_burnt;
    //         const protectedCount = thresholdResult.auto_pending_created;
    //         const protectedText =
    //           protectedCount > 0
    //             ? `\n보유 상점 중 100점 단위 ${protectedCount}건은 상품권 발급 대기로 보호되었고, 잔여 ${burnt}점은 소멸되었습니다.`
    //             : burnt > 0
    //               ? `\n보유 상점 ${burnt}점이 소멸되었습니다.`
    //               : '';
    //         alimtalkMessage = `[퇴원 검토 안내]\n\n자녀(${studentProfile.name}) 학생이 분기 벌점 30점에 도달하여 퇴원 검토 대상이 되었습니다.\n원장이 곧 직접 연락드립니다.${protectedText}`;
    //       } else if (warnings.includes('warn_25')) {
    //         alimtalkMessage = `[벌점 경고 안내]\n\n자녀(${studentProfile.name}) 학생의 이번 분기 누적 벌점이 25점에 도달했습니다.\n30점 도달 시 퇴원 검토 대상이 되며 보유 상점이 소멸됩니다.\n면담을 위해 곧 연락드리겠습니다.`;
    //       } else {
    //         const pointTypeText = type === 'reward' ? '상점' : '벌점';
    //         const pointSign = type === 'reward' ? '+' : '-';
    //         alimtalkMessage = `[${pointTypeText} 부여 알림]\n\n자녀(${studentProfile.name})에게 ${pointTypeText}이 부여되었습니다.\n\n사유: ${reason}\n점수: ${pointSign}${amount}점`;
    //       }
    //       if (isCritical) {
    //         const category =
    //           thresholdResult?.status === 'consumed' ? 'penalty_threshold30' : 'penalty_warn25';
    //         await sendKakaoAlimtalkToParentCritical({
    //           parentId: parentLink.parent_id,
    //           studentId,
    //           message: alimtalkMessage,
    //           category,
    //           type: 'point',
    //         }).catch(console.error);
    //       } else {
    //         await sendKakaoAlimtalkToParent({
    //           parentId: parentLink.parent_id,
    //           studentId,
    //           message: alimtalkMessage,
    //           type: 'point',
    //         }).catch(console.error);
    //       }
    //     }
    //   } catch (err) {
    //     console.error('Failed to send kakao alimtalk for points:', err);
    //   }
    // }

    // 학생 단계 알림 — 인앱 추가 발송 (warn_10/20/25 별 톤)
    if (warnings.length > 0) {
      const warnMessages: Record<(typeof warnings)[number], { title: string; message: string }> = {
        warn_10: {
          title: '분기 벌점 10점에 도달했어요',
          message: '학습 페이스를 조금만 더 신경 써주세요.',
        },
        warn_20: {
          title: '주의 — 분기 벌점 20점 도달',
          message: '30점 도달 시 보유 상점이 모두 소멸됩니다.',
        },
        warn_25: {
          title: '경고 — 분기 벌점 25점 도달',
          message: '5점만 더 쌓이면 보유 상점이 소멸되고 퇴원 검토 대상이 됩니다.',
        },
      };
      for (const w of warnings) {
        const m = warnMessages[w];
        await createStudentNotification({
          studentId,
          type: 'point',
          title: m.title,
          message: m.message,
          link: '/student/points',
        }).catch(console.error);
      }
    }

    // 30점 도달 학생 인앱 알림
    if (thresholdResult?.status === 'consumed') {
      await createStudentNotification({
        studentId,
        type: 'point',
        title: '면담이 필요합니다',
        message: '원장님께서 곧 안내해드릴게요.',
        link: '/student/points',
      }).catch(console.error);
    }
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  return { success: true, warnings, threshold: thresholdResult };
}

// 상점 다중 학생 일괄 부여 — 동일 항목을 N 명에게 한 번에 부여한다.
//
// 단건 givePoints 의 reward 분기를 학생 리스트로 확장. 다음을 보장:
//   - 사전 IN 조회 1회로 profiles / parent_student_links N+1 회피.
//   - 학생별 branch preset 재매칭. presetId 가 있는데 학생 branch 에서 동일 reason 의
//     active preset 을 찾지 못하면 preset_id=null 로 INSERT 하지 않고 skip (KST 일자
//     unique 인덱스가 preset_id IS NOT NULL 조건이라 null INSERT 는 중복 차단을 우회).
//   - 23505 (오늘 이미 같은 항목) 는 부분 성공 허용 — 학생별 INSERT 직렬 처리.
//   - 인앱 알림은 createBulkStudentNotifications 단일 호출. 학부모 카카오 알림톡은
//     fire-and-forget (단건 경로와 동일한 best-effort 정책).
//
// 벌점은 임계치 hook 이 학생별로 RPC 트랜잭션을 타야 안전해 이 함수 범위 밖이다.
export async function giveRewardBatch(params: {
  studentIds: string[];
  amount: number;
  reason: string;
  presetId: string | null;
}): Promise<{
  success: boolean;
  successCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  failedCount: number;
  duplicateNames?: string[];
  unmatchedNames?: string[];
  error?: string;
}> {
  const { studentIds, amount, reason, presetId } = params;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return {
      success: false,
      successCount: 0,
      duplicateCount: 0,
      unmatchedCount: 0,
      failedCount: 0,
      error: '학생을 선택해주세요.',
    };
  }
  if (!Number.isFinite(amount) || amount < 1) {
    return {
      success: false,
      successCount: 0,
      duplicateCount: 0,
      unmatchedCount: 0,
      failedCount: 0,
      error: '올바른 점수를 입력해주세요.',
    };
  }
  if (!reason || !reason.trim()) {
    return {
      success: false,
      successCount: 0,
      duplicateCount: 0,
      unmatchedCount: 0,
      failedCount: 0,
      error: '사유를 입력해주세요.',
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false,
      successCount: 0,
      duplicateCount: 0,
      unmatchedCount: 0,
      failedCount: 0,
      error: '로그인이 필요합니다.',
    };
  }

  // 사전 일괄 조회 (N+1 회피)
  // [알림톡 비활성화 2026-05-26] parent_student_links 조회는 알림톡 발송용이었으므로 제거
  const [profilesRes] = await Promise.all([
    supabase.from('profiles').select('id, name, branch_id').in('id', studentIds),
    // supabase
    //   .from('parent_student_links')
    //   .select('parent_id, student_id')
    //   .in('student_id', studentIds),
  ]);
  const profilesById = new Map<string, { name: string; branch_id: string | null }>();
  for (const p of (profilesRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    branch_id: string | null;
  }>) {
    profilesById.set(p.id, { name: p.name ?? '', branch_id: p.branch_id });
  }
  // [알림톡 비활성화 2026-05-26] 한 학생당 첫 학부모 1명만 (단건 givePoints 도 .limit(1).maybeSingle())
  // const firstParentByStudent = new Map<string, string>();
  // for (const l of (linksRes.data ?? []) as Array<{ parent_id: string; student_id: string }>) {
  //   if (!firstParentByStudent.has(l.student_id)) {
  //     firstParentByStudent.set(l.student_id, l.parent_id);
  //   }
  // }

  // 학생별 branch preset 재매칭 — 입력 presetId 가 학생 branch 와 다를 수 있음 (슈퍼관리자)
  async function resolveRewardPresetForStudent(
    branchId: string | null,
    inputPresetId: string,
  ): Promise<string | null> {
    if (!branchId) return null;
    const { data: preset } = await supabase
      .from('reward_presets')
      .select('id, branch_id')
      .eq('id', inputPresetId)
      .maybeSingle();
    if (preset && (preset.branch_id as string) === branchId) return inputPresetId;
    const { data: matched } = await supabase
      .from('reward_presets')
      .select('id')
      .eq('branch_id', branchId)
      .eq('reason', reason)
      .eq('is_active', true)
      .maybeSingle();
    return (matched?.id as string | undefined) ?? null;
  }

  const successIds: string[] = [];
  const duplicateNames: string[] = [];
  const unmatchedNames: string[] = [];
  let failedCount = 0;

  for (const studentId of studentIds) {
    const profile = profilesById.get(studentId);
    const studentName = profile?.name || '학생';

    let effectivePresetId: string | null = null;
    let effectivePresetType: 'reward' | null = null;

    if (presetId) {
      effectivePresetId = await resolveRewardPresetForStudent(profile?.branch_id ?? null, presetId);
      if (!effectivePresetId) {
        unmatchedNames.push(studentName);
        continue;
      }
      effectivePresetType = 'reward';
    }

    const { error } = await supabase.from('points').insert({
      student_id: studentId,
      admin_id: user.id,
      type: 'reward',
      amount,
      reason,
      is_auto: false,
      preset_id: effectivePresetId,
      preset_type: effectivePresetType,
      event_kind: 'manual',
    });

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        duplicateNames.push(studentName);
      } else {
        console.error('giveRewardBatch insert error:', error, { studentId });
        failedCount++;
      }
      continue;
    }
    successIds.push(studentId);
  }

  // 알림 발송 — 성공 학생 한정
  if (successIds.length > 0) {
    // [알림톡 비활성화 2026-05-26] sendKakaoAlimtalkToParent 제외
    const { notifyPointsGranted } = await import('./notification');

    // 학생 + 모든 학부모 앱 푸시 — fire-and-forget. 학생 이름 매핑 활용해 N+1 회피.
    for (const studentId of successIds) {
      const profile = profilesById.get(studentId);
      notifyPointsGranted({
        studentId,
        type: 'reward',
        amount,
        reason,
        studentName: profile?.name || undefined,
      }).catch((e) => console.error('giveRewardBatch notifyPointsGranted error:', e));
    }

    // [알림톡 비활성화 2026-05-26] 학부모 카카오 알림톡 — 기존 정책 유지 (첫 학부모에게만 발송).
    // for (const studentId of successIds) {
    //   const parentId = firstParentByStudent.get(studentId);
    //   const profile = profilesById.get(studentId);
    //   if (!parentId || !profile?.name) continue;
    //   const alimtalkMessage = `[상점 부여 알림]\n\n자녀(${profile.name})에게 상점이 부여되었습니다.\n\n사유: ${reason}\n점수: +${amount}점`;
    //   void sendKakaoAlimtalkToParent({
    //     parentId,
    //     studentId,
    //     message: alimtalkMessage,
    //     type: 'point',
    //   }).catch((e) => console.error('giveRewardBatch alimtalk error:', e));
    // }
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');

  return {
    success: true,
    successCount: successIds.length,
    duplicateCount: duplicateNames.length,
    unmatchedCount: unmatchedNames.length,
    failedCount,
    ...(duplicateNames.length > 0 ? { duplicateNames } : {}),
    ...(unmatchedNames.length > 0 ? { unmatchedNames } : {}),
  };
}

// 상벌점 현황 — points_summary RPC 로 단일 쿼리 집계.
// branchId === null 은 슈퍼관리자의 "전 지점" 신호.
export async function getPointsOverview(params: { branchId: string | null }) {
  const supabase = await createClient();
  const { branchId } = params;

  // 학생 명단 (좌석 순) — 활성 학생만 (RPC 와 일관)
  let studentsQ = supabase
    .from('student_profiles')
    .select('id, seat_number, profiles!inner (name, branch_id, withdrawn_at)')
    .is('profiles.withdrawn_at', null)
    .order('seat_number', { ascending: true });
  if (branchId) studentsQ = studentsQ.eq('profiles.branch_id', branchId);
  const { data: students } = await studentsQ;

  if (!students || students.length === 0) return [];

  // 집계 RPC — 학생별 reward/penalty/net. branchId 가 NULL 이면 슈퍼관리자 — RPC 가 전체 반환.
  const { data: summary } = await supabase.rpc('points_summary', {
    p_branch_id: branchId,
  });

  const summaryMap = new Map<string, { reward: number; penalty: number; total: number }>();
  for (const row of summary ?? []) {
    summaryMap.set(row.student_id, {
      reward: row.reward_total,
      penalty: row.penalty_total,
      total: row.net_total,
    });
  }

  return students.map((student) => {
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    const s = summaryMap.get(student.id) ?? { reward: 0, penalty: 0, total: 0 };
    return {
      id: student.id,
      seatNumber: student.seat_number,
      name: profile?.name || '이름 없음',
      reward: s.reward,
      penalty: s.penalty,
      total: s.total,
    };
  });
}

// 상벌점 내역 — URL 페이지네이션 + 필터 + 정렬.
// branch 격리는 RLS 가 자동 처리 (admin RLS qual: profiles.branch_id = get_admin_branch_id()).
// branchId === null 은 슈퍼관리자의 "전 지점" 신호.
export interface PointsHistoryParams {
  branchId: string | null;
  page: number;
  pageSize: number;
  q?: string;
  sort: 'created_at' | 'amount';
  dir: 'asc' | 'desc';
  type?: 'reward' | 'penalty';
  studentId?: string;
}

export interface PointsHistoryRow {
  id: string;
  student_id: string;
  type: 'reward' | 'penalty';
  amount: number;
  reason: string;
  is_auto: boolean;
  created_at: string;
  studentName: string;
  studentSeatNumber: number | null;
  adminName: string;
}

export interface PointsHistoryResult {
  rows: PointsHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

// 검색 q 는 "사유 OR 학생 이름" 부분 일치. SQL RPC 로 단일 쿼리 처리.
// branch 격리는 RLS (admin 정책) 가 자동 처리.
export async function getAllPointsHistory(
  params: PointsHistoryParams,
): Promise<PointsHistoryResult> {
  const supabase = await createClient();
  const { page, pageSize, q, sort, dir, type, studentId } = params;
  const offset = Math.max(0, (Math.max(1, page) - 1) * pageSize);

  const { data, error } = await supabase.rpc('search_points_history', {
    p_q: q && q.trim() ? q.trim() : null,
    p_type: type ?? null,
    p_student_id: studentId ?? null,
    p_sort: sort,
    p_dir: dir,
    p_offset: offset,
    p_limit: pageSize,
  });

  if (error) {
    console.error('[getAllPointsHistory]', error);
    return { rows: [], total: 0, page: 1, pageSize };
  }

  const list = (data ?? []) as Array<{
    id: string;
    student_id: string;
    admin_id: string | null;
    type: 'reward' | 'penalty';
    amount: number;
    reason: string;
    is_auto: boolean;
    created_at: string;
    student_name: string;
    student_seat_number: number | null;
    admin_name: string | null;
    total_count: number;
  }>;

  const rows: PointsHistoryRow[] = list.map((r) => ({
    id: r.id,
    student_id: r.student_id,
    type: r.type,
    amount: r.amount,
    reason: r.reason,
    is_auto: r.is_auto,
    created_at: r.created_at,
    studentName: r.student_name || '이름 없음',
    studentSeatNumber: r.student_seat_number,
    adminName: r.admin_name || '시스템',
  }));

  const total = list[0]?.total_count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = total === 0 ? 1 : Math.min(Math.max(1, page), lastPage);

  return { rows, total, page: clampedPage, pageSize };
}

// 필터 조건에 매칭되는 모든 상벌점 일괄 삭제 (페이지네이션된 화면에서 "필터 결과 전체 삭제" 용도).
// branch 격리는 RLS 자동 처리.
// protected event_kind 는 사전 필터로 제외 + DB BEFORE DELETE 트리거 이중 안전망.
export async function deletePointsByFilter(params: {
  type?: 'reward' | 'penalty';
  studentId?: string;
  q?: string;
}) {
  const supabase = await createClient();

  // 1) 매칭되는 행 조회 (event_kind/type/student_id 포함, count + 학생별 분기 재계산용)
  // 검색 q 는 "사유 OR 학생 이름" 부분 일치. 학생 이름 매칭은 profiles 에서 ID 후보를
  // 먼저 가져와 student_id IN (...) 조건으로 결합.
  let idsQuery = supabase
    .from('points')
    .select('id, student_id, type, event_kind', { count: 'exact', head: false });
  if (params.type) idsQuery = idsQuery.eq('type', params.type);
  if (params.studentId) idsQuery = idsQuery.eq('student_id', params.studentId);
  if (params.q && params.q.trim()) {
    const raw = params.q.trim();
    const pattern = `%${raw.replace(/[\\%_]/g, '\\$&')}%`;
    const { data: nameMatched } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_type', 'student')
      .ilike('name', pattern);
    const matchedIds = (nameMatched ?? []).map((p) => p.id);
    if (matchedIds.length > 0) {
      idsQuery = idsQuery.or(`reason.ilike.${pattern},student_id.in.(${matchedIds.join(',')})`);
    } else {
      idsQuery = idsQuery.ilike('reason', pattern);
    }
  }
  // protected event_kind 는 사전 제외 (DB 트리거가 이중 차단하지만 silent skip 위해)
  idsQuery = idsQuery.not(
    'event_kind',
    'in',
    '(reset_on_threshold,reset_on_threshold_revert,redeem,manual_cancel,auto_daily_focus)',
  );

  const { data: idsData, error: idsError } = await idsQuery.limit(10000);
  if (idsError) {
    return { success: false, error: '대상 조회 실패', deletedCount: 0 };
  }
  const rows = (idsData ?? []) as Array<{ id: string; student_id: string; type: string }>;
  if (rows.length === 0) {
    return { success: true, deletedCount: 0 };
  }
  const ids = rows.map((r) => r.id);
  const penaltyStudentIds = Array.from(
    new Set(rows.filter((r) => r.type === 'penalty').map((r) => r.student_id)),
  );

  // 2) weekly_point_history 참조 해제 (deletePoints 와 동일 패턴)
  await supabase.from('weekly_point_history').update({ point_id: null }).in('point_id', ids);

  // 3) 일괄 DELETE
  const { error: delError } = await supabase.from('points').delete().in('id', ids);
  if (delError) {
    console.error('[deletePointsByFilter]', delError);
    return { success: false, error: '삭제 실패', deletedCount: 0 };
  }

  // 4) 영향 받은 학생별 분기 누적 재계산 → 30점 미만이면 자동 검토 취소
  for (const sid of penaltyStudentIds) {
    await maybeRevertWithdrawalReview(supabase, sid).catch(console.error);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  revalidatePath('/admin/notifications');
  return { success: true, deletedCount: ids.length };
}

// 단계 8: 벌점 부여 dry-run (관리자 confirm 모달용)
export async function previewPenalty(studentId: string, amount: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('preview_penalty', {
    p_student_id: studentId,
    p_amount: amount,
  });
  if (error) {
    console.error('preview_penalty error:', error);
    return { error: '미리보기 실패' };
  }
  return {
    success: true,
    preview: data as {
      quarter_total_before: number;
      quarter_total_after: number;
      thresholds_reached: number[];
      reaches_30: boolean;
      current_balance: number;
      queue_count: number;
      protected_auto_pending: number;
      burnt_estimate: number;
    },
  };
}

// 단계 8: 퇴원 검토 대기 큐 조회 (관리자 화면)
export async function getWithdrawalReviewQueue(branchId: string | null) {
  const supabase = await createClient();
  const { getCurrentQuarterStartKST } = await import('@/lib/utils');
  const qStart = getCurrentQuarterStartKST();

  let query = supabase
    .from('student_profiles')
    .select(
      `
      id,
      seat_number,
      withdrawal_review_at,
      withdrawal_review_reason,
      threshold_consumed_in_quarter_at,
      profiles!inner (
        name,
        branch_id,
        withdrawn_at
      )
    `,
    )
    .not('withdrawal_review_at', 'is', null)
    .is('profiles.withdrawn_at', null)
    .order('withdrawal_review_at', { ascending: false });

  if (branchId) {
    query = query.eq('profiles.branch_id', branchId);
  }

  const { data: students } = await query.limit(200);
  if (!students || students.length === 0) return [];

  // 학생별 분기 누적 벌점 + 마지막 벌점 + auto_pending 건수 병렬 조회
  const studentIds = students.map((s) => s.id);
  const [{ data: penalties }, { data: lastPoints }, { data: pendings }] = await Promise.all([
    supabase
      .from('points')
      .select('student_id, amount')
      .in('student_id', studentIds)
      .eq('type', 'penalty')
      .gte('created_at', qStart.toISOString()),
    supabase
      .from('points')
      .select('student_id, reason, amount, created_at')
      .in('student_id', studentIds)
      .eq('type', 'penalty')
      .order('created_at', { ascending: false }),
    supabase
      .from('reward_redemptions')
      .select('student_id, status')
      .in('student_id', studentIds)
      .eq('status', 'auto_pending'),
  ]);

  const penaltyByStudent = new Map<string, number>();
  for (const p of penalties ?? []) {
    penaltyByStudent.set(p.student_id, (penaltyByStudent.get(p.student_id) ?? 0) + p.amount);
  }
  const lastByStudent = new Map<string, { reason: string; amount: number; createdAt: string }>();
  for (const p of lastPoints ?? []) {
    if (!lastByStudent.has(p.student_id)) {
      lastByStudent.set(p.student_id, {
        reason: p.reason,
        amount: p.amount,
        createdAt: p.created_at,
      });
    }
  }
  const pendingByStudent = new Map<string, number>();
  for (const r of pendings ?? []) {
    pendingByStudent.set(r.student_id, (pendingByStudent.get(r.student_id) ?? 0) + 1);
  }

  return students.map((s) => {
    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    return {
      studentId: s.id,
      name: (profile as { name?: string })?.name ?? '이름 없음',
      seatNumber: s.seat_number,
      reviewAt: s.withdrawal_review_at,
      reviewReason: s.withdrawal_review_reason,
      consumedAt: s.threshold_consumed_in_quarter_at,
      penaltyQuarter: penaltyByStudent.get(s.id) ?? 0,
      lastPenalty: lastByStudent.get(s.id) ?? null,
      protectedRedemptionCount: pendingByStudent.get(s.id) ?? 0,
    };
  });
}

// 단계 8: 퇴원 검토 확정 (실제 퇴원 처리)
export async function confirmWithdrawal(studentId: string, reason?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('student_profiles')
    .select('withdrawal_review_at, withdrawal_review_reason')
    .eq('id', studentId)
    .maybeSingle();
  if (!profile?.withdrawal_review_at) {
    return { error: '퇴원 검토 대상이 아닙니다.' };
  }

  const result = await softDeleteUser({
    userId: studentId,
    withdrawnBy: user.id,
    reason: reason ?? profile.withdrawal_review_reason ?? '벌점 30점 도달 (관리자 확정)',
  });

  if ('error' in result) {
    return { error: result.error };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  return { success: true, warning: 'warning' in result ? result.warning : undefined };
}

// 단계 8: 퇴원 검토 취소 + 옵션 상점 복구
export async function cancelWithdrawalReviewAction(
  studentId: string,
  restoreReward: boolean = true,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_withdrawal_review', {
    p_student_id: studentId,
    p_restore_reward: restoreReward,
  });
  if (error) {
    console.error('cancel_withdrawal_review error:', error);
    return { error: '검토 취소 실패' };
  }
  const result = data as
    | { status: 'cancelled'; restored_reward: number; cancelled_pending: number }
    | { status: 'not_in_review' };

  if (result.status === 'not_in_review') {
    return { error: '이미 검토 대상이 아닙니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  return {
    success: true,
    restoredReward: result.restored_reward,
    cancelledPending: result.cancelled_pending,
  };
}

// 단계 10: 상품권 큐 조회 (관리자 화면)
export async function getRedemptionQueue(branchId: string | null) {
  const supabase = await createClient();

  let query = supabase
    .from('reward_redemptions')
    .select(
      `
      id,
      student_id,
      status,
      points_used,
      voucher_amount,
      voucher_code,
      trigger,
      requested_at,
      issued_at,
      profiles!reward_redemptions_student_id_fkey (
        name,
        branch_id
      )
    `,
    )
    .in('status', ['requested', 'auto_pending'])
    .order('requested_at', { ascending: true });

  if (branchId) {
    query = query.eq('profiles.branch_id', branchId);
  }
  const { data } = await query.limit(200);
  return data ?? [];
}

// 단계 10: 상품권 발급 (RPC issue_redemption 호출 + 알림)
export async function issueRedemption(params: {
  redemptionId: string;
  voucherAmount: number;
  voucherCode: string;
  voucherNote?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data, error } = await supabase.rpc('issue_redemption', {
    p_redemption_id: params.redemptionId,
    p_admin_id: user.id,
    p_voucher_amount: params.voucherAmount,
    p_voucher_code: params.voucherCode,
    p_voucher_note: params.voucherNote ?? null,
  });
  if (error) {
    console.error('issue_redemption error:', error);
    return { error: '상품권 발급 실패' };
  }
  const result = data as
    | { status: 'issued'; student_id: string }
    | { status: 'rejected_insufficient'; balance: number }
    | { status: 'not_pending' };

  if (result.status === 'rejected_insufficient') {
    return { error: `잔액 부족으로 자동 거부되었습니다. (잔액 ${result.balance})` };
  }
  if (result.status === 'not_pending') {
    return { error: '이미 처리된 신청입니다.' };
  }

  // 학생/학부모 알림
  // [알림톡 비활성화 2026-05-26] sendKakaoAlimtalkToParent 제외
  const { createStudentNotification } = await import('./notification');
  await createStudentNotification({
    studentId: result.student_id,
    type: 'point',
    title: '상품권이 발급되었습니다',
    message: `${params.voucherAmount.toLocaleString()}원 / 코드: ${params.voucherCode}`,
    link: '/student/points',
  }).catch(console.error);

  // [알림톡 비활성화 2026-05-26] 학부모 알림톡
  // try {
  //   const { data: parentLink } = await supabase
  //     .from('parent_student_links')
  //     .select('parent_id')
  //     .eq('student_id', result.student_id)
  //     .limit(1)
  //     .maybeSingle();
  //   const { data: studentProfile } = await supabase
  //     .from('profiles')
  //     .select('name')
  //     .eq('id', result.student_id)
  //     .single();
  //   if (parentLink?.parent_id && studentProfile?.name) {
  //     await sendKakaoAlimtalkToParent({
  //       parentId: parentLink.parent_id,
  //       studentId: result.student_id,
  //       message: `[상품권 발급]\n\n자녀(${studentProfile.name}) 학생의 상품권이 발급되었습니다.\n\n금액: ${params.voucherAmount.toLocaleString()}원\n코드: ${params.voucherCode}`,
  //       type: 'point',
  //     }).catch(console.error);
  //   }
  // } catch (err) {
  //   console.error('Failed to send kakao alimtalk for redemption:', err);
  // }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  return { success: true };
}

// 단계 10: 상품권 신청 거부
export async function rejectRedemption(params: { redemptionId: string; reason: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: row } = await supabase
    .from('reward_redemptions')
    .select('student_id, status')
    .eq('id', params.redemptionId)
    .maybeSingle();
  if (!row) return { error: '해당 신청을 찾을 수 없습니다.' };
  if (!['requested', 'auto_pending'].includes(row.status)) {
    return { error: '이미 처리된 신청입니다.' };
  }

  const { error } = await supabase
    .from('reward_redemptions')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: user.id,
      rejected_reason: params.reason,
    })
    .eq('id', params.redemptionId);
  if (error) {
    console.error('rejectRedemption error:', error);
    return { error: '거부 처리 실패' };
  }

  const { createStudentNotification } = await import('./notification');
  await createStudentNotification({
    studentId: row.student_id,
    type: 'point',
    title: '상품권 신청이 거부되었습니다',
    message: params.reason,
    link: '/student/points',
  }).catch(console.error);

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  return { success: true };
}

// 상벌점 취소 (append-only) — DB RPC cancel_point 호출.
// 원본 행은 그대로 두고 음수 amount 행을 event_kind='manual_cancel' 로 INSERT.
// type='penalty' 취소 시 분기 누적 < 30 자동 검토 취소 + 상점 복구.
export async function cancelPoint(pointId: string, reason?: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data, error } = await supabase.rpc('cancel_point', {
    p_point_id: pointId,
    p_admin_id: user.id,
    p_reason: reason ?? null,
  });

  if (error) {
    console.error('cancel_point error:', error);
    return { error: '상벌점 취소에 실패했습니다.' };
  }

  const result = data as { status: string; original_id?: string; event_kind?: string };
  if (result.status === 'not_found') return { error: '해당 내역을 찾을 수 없습니다.' };
  if (result.status === 'protected') {
    return { error: `시스템이 자동 생성한 내역(${result.event_kind})은 취소할 수 없습니다.` };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  return { success: true };
}

// 상벌점 내역 삭제 (점수 원상복구)
//
// 정책 (단계 5):
// - event_kind IN ('reset_on_threshold', 'reset_on_threshold_revert', 'redeem',
//   'manual_cancel', 'auto_daily_focus') 는 DB BEFORE DELETE 트리거가 차단.
// - 삭제 후 type='penalty' 라면 분기 누적 재계산 → < 30 이면 자동 검토 취소 + 상점 복구.
// - append-only 정책 권장: 대안 `cancelPoint` (manual_cancel 음수 행 INSERT) 도 제공.
export async function deletePoint(pointId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 삭제 전에 포인트 정보 확인 (알림용 + event_kind 사전 가드)
  const { data: pointData } = await supabase
    .from('points')
    .select(
      `
      *,
      student:student_id (
        seat_number,
        profiles!inner (name)
      )
    `,
    )
    .eq('id', pointId)
    .single();

  if (!pointData) {
    return { error: '해당 내역을 찾을 수 없습니다.' };
  }

  const protectedKinds = new Set([
    'reset_on_threshold',
    'reset_on_threshold_revert',
    'redeem',
    'manual_cancel',
    'auto_daily_focus',
  ]);
  if (protectedKinds.has(pointData.event_kind as string)) {
    return {
      error: '시스템이 자동 생성한 내역은 삭제할 수 없습니다. 관리자에게 문의해주세요.',
    };
  }

  // weekly_point_history에서 참조 중인 point_id를 null로 업데이트하여 참조 해제 (deletePoints와 동일)
  const { error: clearRefError } = await supabase
    .from('weekly_point_history')
    .update({ point_id: null })
    .eq('point_id', pointId);

  if (clearRefError) {
    console.error('Error clearing point reference:', clearRefError);
  }

  const { error } = await supabase.from('points').delete().eq('id', pointId);

  if (error) {
    console.error('Error deleting point:', error);
    return { error: '상벌점 삭제에 실패했습니다.' };
  }

  // penalty 삭제 시 분기 누적이 30점 미만이 되면 검토 취소 + 상점 복구
  if (pointData.type === 'penalty') {
    await maybeRevertWithdrawalReview(supabase, pointData.student_id).catch(console.error);
  }

  // 학생과 연결된 학부모 조회
  const { data: parentLink } = await supabase
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', pointData.student_id)
    .maybeSingle();

  // 학생 및 학부모(있는 경우) 알림 발송 - notifications 테이블에도 기록됨
  const { sendNotificationToAll } = await import('./notification');
  await sendNotificationToAll({
    studentId: pointData.student_id,
    parentId: parentLink?.parent_id ?? undefined,
    type: 'point',
    title: pointData.type === 'penalty' ? '벌점이 취소되었습니다' : '상점이 취소되었습니다',
    message: `${pointData.reason} (${pointData.type === 'penalty' ? '-' : '+'}${pointData.amount}점) - 관리자에 의해 취소됨`,
    link: '/student/points',
  }).catch(console.error);

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  revalidatePath('/admin/notifications');
  return { success: true };
}

// 상벌점 내역 일괄 삭제 (점수 원상복구)
// protected event_kind 는 사전 필터로 제외.
export async function deletePoints(pointIds: string[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  if (!pointIds || pointIds.length === 0) {
    return { error: '삭제할 내역을 선택해주세요.' };
  }

  // 삭제 전에 포인트 정보들 확인 (알림용 + event_kind 필터)
  const { data: pointsData } = await supabase
    .from('points')
    .select(
      `
      *,
      student:student_id (
        seat_number,
        profiles!inner (name)
      )
    `,
    )
    .in('id', pointIds)
    .not(
      'event_kind',
      'in',
      '(reset_on_threshold,reset_on_threshold_revert,redeem,manual_cancel,auto_daily_focus)',
    );

  if (!pointsData || pointsData.length === 0) {
    return { error: '해당 내역을 찾을 수 없습니다.' };
  }

  // weekly_point_history에서 참조 중인 point_id를 null로 업데이트하여 참조 해제
  const { error: clearRefError } = await supabase
    .from('weekly_point_history')
    .update({ point_id: null })
    .in('point_id', pointIds);

  if (clearRefError) {
    console.error('Error clearing point references:', clearRefError);
  }

  const { error } = await supabase.from('points').delete().in('id', pointIds);

  if (error) {
    console.error('Error deleting points:', error);
    return { error: '상벌점 일괄 삭제에 실패했습니다.' };
  }

  // 학생들과 연결된 학부모 조회
  const studentIds = [...new Set(pointsData.map((p) => p.student_id))];
  const { data: parentLinks } = await supabase
    .from('parent_student_links')
    .select('student_id, parent_id')
    .in('student_id', studentIds);

  const parentMap = new Map((parentLinks || []).map((l) => [l.student_id, l.parent_id]));

  // 학생들 및 학부모(있는 경우) 알림 발송 - notifications 테이블에도 기록됨
  const { sendNotificationToAll } = await import('./notification');
  for (const pointData of pointsData) {
    await sendNotificationToAll({
      studentId: pointData.student_id,
      parentId: parentMap.get(pointData.student_id) ?? undefined,
      type: 'point',
      title: pointData.type === 'penalty' ? '벌점이 취소되었습니다' : '상점이 취소되었습니다',
      message: `${pointData.reason} (${pointData.type === 'penalty' ? '-' : '+'}${pointData.amount}점) - 관리자에 의해 취소됨`,
      link: '/student/points',
    }).catch(console.error);
  }

  // penalty 삭제 시 학생별 분기 재계산 → 30점 미만이면 자동 검토 취소
  const penaltyStudentIds = Array.from(
    new Set(pointsData.filter((p) => p.type === 'penalty').map((p) => p.student_id)),
  );
  for (const sid of penaltyStudentIds) {
    await maybeRevertWithdrawalReview(supabase, sid).catch(console.error);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/points');
  revalidatePath('/admin/notifications');
  return { success: true, deletedCount: pointsData.length };
}

// ============================================
// 회원 관리 관련
// ============================================

// 전체 회원 목록 조회 (학생의 경우 seat_number 포함)
export async function getAllMembers(
  userType?: 'student' | 'parent' | 'admin',
  branchId?: string | null,
) {
  const supabase = await createClient();

  // 기본 프로필 조회 (지점명 포함)
  let query = supabase
    .from('profiles')
    .select(
      `
      *,
      branch:branch_id (
        id,
        name
      )
    `,
    )
    .order('created_at', { ascending: false });

  if (userType) {
    query = query.eq('user_type', userType);
  }

  // 브랜치 필터 적용 (관리자에게 지점이 지정된 경우)
  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data: profiles } = await query;
  if (!profiles) return [];

  // 학생의 경우 student_profiles에서 seat_number 가져오기
  const studentIds = profiles.filter((p) => p.user_type === 'student').map((p) => p.id);

  let seatMap: Record<string, number | null> = {};
  let studentTypeMap: Record<string, string | null> = {};
  if (studentIds.length > 0) {
    const { data: studentProfiles } = await supabase
      .from('student_profiles')
      .select('id, seat_number, student_type_id')
      .in('id', studentIds);

    if (studentProfiles) {
      seatMap = studentProfiles.reduce(
        (acc, sp) => {
          acc[sp.id] = sp.seat_number;
          return acc;
        },
        {} as Record<string, number | null>,
      );
      studentTypeMap = studentProfiles.reduce(
        (acc, sp) => {
          acc[sp.id] = sp.student_type_id;
          return acc;
        },
        {} as Record<string, string | null>,
      );
    }
  }

  // 결과 합치기
  return profiles.map((p) => ({
    ...p,
    seat_number: p.user_type === 'student' ? (seatMap[p.id] ?? null) : null,
    student_type_id: p.user_type === 'student' ? (studentTypeMap[p.id] ?? null) : null,
    branch_name: p.branch?.name || null,
  }));
}

// 학부모 목록 조회 (연결된 학생 정보 포함).
// branchId 명시 — 해당 지점 학생의 학부모만 반환 (RLS 우회한 adminClient 사용해도 누수 차단).
export async function getAllParentsWithStudents(branchId?: string | null) {
  const adminClient = createAdminClient();

  // 1. branchId 있으면 해당 지점 학생 ID 집합 → 그 학생들과 연결된 학부모 ID 집합 추출
  let allowedParentIds: string[] | null = null;
  if (branchId) {
    const { data: branchStudents } = await adminClient
      .from('profiles')
      .select('id')
      .eq('user_type', 'student')
      .eq('branch_id', branchId);

    const branchStudentIds = (branchStudents ?? []).map((s) => s.id as string);
    if (branchStudentIds.length === 0) return [];

    const { data: branchLinks } = await adminClient
      .from('parent_student_links')
      .select('parent_id')
      .in('student_id', branchStudentIds);

    allowedParentIds = [...new Set((branchLinks ?? []).map((l) => l.parent_id as string))];
    if (allowedParentIds.length === 0) return [];
  }

  // 학부모 프로필 조회
  let parentQuery = adminClient
    .from('profiles')
    .select('*')
    .eq('user_type', 'parent')
    .order('created_at', { ascending: false });
  if (allowedParentIds !== null) {
    parentQuery = parentQuery.in('id', allowedParentIds);
  }
  const { data: parents, error } = await parentQuery;

  if (error || !parents) {
    console.error('Error fetching parents:', error);
    return [];
  }

  if (parents.length === 0) return [];

  const parentIds = parents.map((p) => p.id);

  // 배치 쿼리: 전체 학부모의 연결 학생 한 번에 조회
  const { data: allLinks } = await adminClient
    .from('parent_student_links')
    .select(
      `
      parent_id,
      student:student_id (
        id,
        seat_number,
        profiles!inner (name, branch_id, branch:branch_id (name))
      )
    `,
    )
    .in('parent_id', parentIds);

  // parent_id별로 그룹핑
  const linksByParent: Record<string, typeof allLinks> = {};
  for (const link of allLinks ?? []) {
    if (!linksByParent[link.parent_id]) linksByParent[link.parent_id] = [];
    linksByParent[link.parent_id]!.push(link);
  }

  type ParentLinkStudentProfile = {
    name: string | null;
    branch: { name: string | null } | { name: string | null }[] | null;
  };
  type ParentLinkStudent = {
    id: string;
    seat_number: number | null;
    profiles: ParentLinkStudentProfile | ParentLinkStudentProfile[] | null;
  };
  type ParentLinkRow = {
    parent_id: string;
    student: ParentLinkStudent | ParentLinkStudent[] | null;
  };

  return parents.map((parent) => {
    const links = (linksByParent[parent.id] ?? []) as ParentLinkRow[];
    const students = links.map((link) => {
      const student = Array.isArray(link.student) ? link.student[0] : link.student;
      const studentProfile = student?.profiles
        ? Array.isArray(student.profiles)
          ? student.profiles[0]
          : student.profiles
        : null;
      const branch = studentProfile?.branch
        ? Array.isArray(studentProfile.branch)
          ? studentProfile.branch[0]
          : studentProfile.branch
        : null;
      return {
        id: student?.id || '',
        name: studentProfile?.name || '이름 없음',
        seatNumber: student?.seat_number ?? null,
        branchName: branch?.name ?? null,
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
  });
}

// 학생 상세 정보 조회
export async function getStudentDetail(studentId: string) {
  const supabase = await createClient();

  const { data: student } = await supabase
    .from('student_profiles')
    .select(
      `
      *,
      profiles!inner (*),
      student_type:student_type_id (
        id,
        name,
        weekly_goal_hours
      )
    `,
    )
    .eq('id', studentId)
    .single();

  if (!student) return null;

  // 연결된 학부모 목록 (parent_student_links → profiles 조회, 복수 지원)
  const { data: parentLinks } = await supabase
    .from('parent_student_links')
    .select(
      `
      parent:parent_id (
        id,
        profiles!inner (*)
      )
    `,
    )
    .eq('student_id', studentId);

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

  const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;

  // 퇴원 처리자 이름 1회 조회 (있을 경우)
  let withdrawnByName: string | null = null;
  if (profile?.withdrawn_by) {
    const { data: withdrawnBy } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', profile.withdrawn_by)
      .maybeSingle();
    withdrawnByName = withdrawnBy?.name ?? null;
  }

  // 복수 학부모 목록 처리
  type ParentProfileRow = {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  type ParentObjectRow = {
    id: string;
    profiles: ParentProfileRow | ParentProfileRow[] | null;
  };
  type ParentLinkRowDetail = {
    parent: ParentObjectRow | ParentObjectRow[] | null;
  };

  const parents = ((parentLinks || []) as ParentLinkRowDetail[])
    .map((link) => {
      const parentObj = Array.isArray(link.parent) ? link.parent[0] : link.parent;
      const parentProfile = parentObj?.profiles
        ? Array.isArray(parentObj.profiles)
          ? parentObj.profiles[0]
          : parentObj.profiles
        : null;
      if (!parentProfile) return null;
      return {
        id: parentObj?.id || '',
        name: parentProfile.name ?? '',
        email: parentProfile.email ?? '',
        phone: parentProfile.phone ?? '',
      };
    })
    .filter((p): p is { id: string; name: string; email: string; phone: string } => p !== null);

  return {
    id: student.id,
    seatNumber: student.seat_number,
    parentCode: student.parent_code,
    capsId: student.caps_id,
    studentTypeId: student.student_type_id,
    studentType: student.student_type
      ? {
          id: student.student_type.id,
          name: student.student_type.name,
          weeklyGoalHours: student.student_type.weekly_goal_hours,
        }
      : null,
    name: profile?.name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    createdAt: profile?.created_at || '',
    branchId: profile?.branch_id || null,
    withdrawnAt: profile?.withdrawn_at ?? null,
    withdrawnBy: profile?.withdrawn_by ?? null,
    withdrawnByName,
    withdrawnReason: profile?.withdrawn_reason ?? null,
    parents,
    parent: parents[0] || null,
    stats: {
      attendanceDays: new Set(
        (attendance || [])
          .filter((a) => a.type === 'check_in')
          .map((a) => new Date(a.timestamp).toISOString().split('T')[0]),
      ).size,
      avgFocus:
        focusScores && focusScores.length > 0
          ? Math.round(
              (focusScores.reduce((sum, f) => sum + f.score, 0) / focusScores.length) * 10,
            ) / 10
          : null,
      totalReward: (points || [])
        .filter((p) => p.type === 'reward')
        .reduce((sum, p) => sum + p.amount, 0),
      totalPenalty: (points || [])
        .filter((p) => p.type === 'penalty')
        .reduce((sum, p) => sum + p.amount, 0),
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
    // UNIQUE 위반 — 누가 점유 중인지 안내. 탈퇴자/타 지점도 잡으려고 admin client 사용.
    if (error.code === '23505' && normalizedCapsId) {
      const adminClient = createAdminClient();
      const { data: holder } = await adminClient
        .from('student_profiles')
        .select('id, profiles!inner(name, withdrawn_at)')
        .eq('caps_id', normalizedCapsId)
        .maybeSingle();

      if (holder) {
        const profile = (
          holder as unknown as { profiles: { name: string; withdrawn_at: string | null } }
        ).profiles;
        const label = profile.withdrawn_at ? `탈퇴된 학생(${profile.name})` : profile.name;
        throw new Error(`CAPS ID ${normalizedCapsId}은(는) 이미 ${label}이(가) 사용 중입니다.`);
      }
      throw new Error(`CAPS ID ${normalizedCapsId}은(는) 이미 사용 중입니다.`);
    }
    console.error('Error updating CAPS ID:', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin/members');
  return true;
}

// 회원 정보 수정
export async function updateMember(
  userId: string,
  data: {
    name?: string;
    phone?: string;
    school?: string | null;
    grade?: number | null;
    branch_id?: string | null;
  },
) {
  const adminClient = createAdminClient();

  const { error } = await adminClient
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
  revalidatePath('/admin/student-types');
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
  studentTypeId: string | null,
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

// 학생 가입 비승인
export async function rejectStudent(studentId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      is_rejected: true,
      rejected_at: new Date().toISOString(),
    })
    .eq('id', studentId);

  if (error) {
    console.error('Error rejecting student:', error);
    return { success: false, error: '학생 비승인에 실패했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/members');
  return { success: true };
}

// 학생 승인 상태 직접 변경 (승인 ↔ 대기 ↔ 비승인)
export async function updateStudentApprovalStatus(
  studentId: string,
  status: 'approved' | 'pending' | 'rejected',
) {
  const supabase = await createClient();

  const updateData: {
    is_approved: boolean;
    is_rejected: boolean;
    rejected_at?: string | null;
  } = {
    is_approved: status === 'approved',
    is_rejected: status === 'rejected',
    rejected_at: status === 'rejected' ? new Date().toISOString() : null,
  };

  const { error } = await supabase.from('profiles').update(updateData).eq('id', studentId);

  if (error) {
    console.error('Error updating approval status:', error);
    return { success: false, error: '승인 상태 변경에 실패했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/members');
  return { success: true };
}

// ============================================
// 알림 관련
// ============================================

// 알림 목록 조회. branchId === null 은 슈퍼관리자의 "전 지점" 신호 (RLS 가 자동 격리).
export interface NotificationsListParams {
  branchId: string | null;
  page: number;
  pageSize: number;
  q?: string;
  sort: 'sent_at';
  dir: 'asc' | 'desc';
  type?: 'late' | 'absent' | 'point' | 'schedule' | 'system';
}

export interface NotificationRow {
  id: string;
  branch_id: string;
  parent_id: string | null;
  student_id: string | null;
  type: 'late' | 'absent' | 'point' | 'schedule' | 'system';
  message: string;
  sent_via: string;
  sent_at: string;
  is_sent: boolean;
  parentName: string;
  studentName: string;
  studentSeatNumber: number | null;
}

export interface NotificationsListResult {
  rows: NotificationRow[];
  total: number;
  page: number;
  pageSize: number;
}

// 알림 목록 — URL 페이지네이션. branch 격리는 RLS (Admins can view branch notifications) 자동 처리.
export async function getNotifications(
  params: NotificationsListParams,
): Promise<NotificationsListResult> {
  const supabase = await createClient();
  const { page, pageSize, q, sort, dir, type } = params;
  const from = Math.max(0, (Math.max(1, page) - 1) * pageSize);
  const to = from + pageSize - 1;

  let query = supabase
    .from('notifications')
    .select(
      `
      *,
      parent:parent_id (profiles!inner (name)),
      student:student_id (seat_number, profiles!inner (name))
    `,
      { count: 'exact' },
    )
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to);

  if (type) query = query.eq('type', type);
  if (q && q.trim()) {
    const pattern = `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
    query = query.ilike('message', pattern);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error('[getNotifications]', error);
    return { rows: [], total: 0, page: 1, pageSize };
  }

  const rows = (data || []).map((n): NotificationRow => {
    const parentProfile = n.parent
      ? Array.isArray(n.parent.profiles)
        ? n.parent.profiles[0]
        : n.parent.profiles
      : null;
    const studentProfile = n.student
      ? Array.isArray(n.student.profiles)
        ? n.student.profiles[0]
        : n.student.profiles
      : null;

    return {
      id: n.id,
      branch_id: n.branch_id,
      parent_id: n.parent_id,
      student_id: n.student_id,
      type: n.type,
      message: n.message,
      sent_via: n.sent_via,
      sent_at: n.sent_at,
      is_sent: n.is_sent,
      parentName: parentProfile?.name || '알 수 없음',
      studentName: studentProfile?.name || '알 수 없음',
      studentSeatNumber: n.student?.seat_number ?? null,
    };
  });

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = total === 0 ? 1 : Math.min(Math.max(1, page), lastPage);

  return { rows, total, page: clampedPage, pageSize };
}

// 알림 통계 — 전체/발송완료/대기/오늘. 페이지네이션과 별도 집계.
// "오늘" 은 학습일 (KST 06:00 → 다음날 03:00) 기준. RLS 자동 branch 격리.
export async function getNotificationStats() {
  const supabase = await createClient();

  const { start, end } = getStudyDayBounds(getStudyDate());

  const [totalRes, sentRes, todayRes] = await Promise.all([
    supabase.from('notifications').select('*', { count: 'exact', head: true }),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('is_sent', true),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', start.toISOString())
      .lt('sent_at', end.toISOString()),
  ]);

  const total = totalRes.count ?? 0;
  const sent = sentRes.count ?? 0;
  return {
    total,
    sent,
    pending: total - sent,
    today: todayRes.count ?? 0,
  };
}

// 수동 알림 발송 (기록만)
export async function sendNotification(
  parentId: string,
  studentId: string,
  type: 'late' | 'absent' | 'point' | 'schedule',
  message: string,
) {
  const supabase = await createClient();

  // branch_id 도출 — 학생의 branch
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', studentId)
    .maybeSingle();
  const branchId = studentProfile?.branch_id;
  if (!branchId) {
    return { error: '학생의 지점 정보를 찾을 수 없습니다.' };
  }

  const { error } = await supabase.from('notifications').insert({
    branch_id: branchId,
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
    .select(
      `
      id,
      seat_number,
      parent_code,
      created_at,
      profiles!inner (name, email, phone, withdrawn_at)
    `,
    )
    .is('profiles.withdrawn_at', null)
    .order('seat_number', { ascending: true });

  return (students || []).map((s) => {
    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    return {
      좌석번호: s.seat_number || '',
      이름: profile?.name || '',
      이메일: profile?.email || '',
      전화번호: profile?.phone || '',
      학부모연결코드: s.parent_code || '',
      가입일: s.created_at
        ? new Date(s.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
        : '',
    };
  });
}

// 학습시간 데이터 조회 (엑셀 다운로드용)
export async function getAttendanceDataForExport(startDate: string, endDate: string) {
  const supabase = await createClient();

  const { data: students } = await supabase
    .from('student_profiles')
    .select(
      `
      id,
      seat_number,
      profiles!inner (name, withdrawn_at)
    `,
    )
    .is('profiles.withdrawn_at', null)
    .order('seat_number', { ascending: true });

  if (!students || students.length === 0) return [];

  const studentIds = students.map((s) => s.id);

  // 학습일(KST 06:00 ~ 다음날 03:00) 단위 집계.
  // 입력은 YYYY-MM-DD(또는 'T...'가 붙은 형태) 양식의 시작/종료 학습일.
  const startStudyDate = (startDate.split('T')[0] ?? startDate).slice(0, 10);
  const endStudyDate = (endDate.split('T')[0] ?? endDate).slice(0, 10);
  const queryStart = getStudyDayBounds(startStudyDate).start;
  const queryEnd = getStudyDayBounds(endStudyDate).end;

  // 학습일 목록 (YYYY-MM-DD) 열거
  const studyDates: string[] = [];
  for (
    let d = new Date(`${startStudyDate}T00:00:00.000Z`);
    d.getTime() <= new Date(`${endStudyDate}T00:00:00.000Z`).getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    studyDates.push(d.toISOString().slice(0, 10));
  }

  // 배치 쿼리: 학습일 경계를 모두 포함하도록 timestamp 범위 확장
  let allExportAttendance: { student_id: string; type: string; timestamp: string }[] = [];
  {
    const baseQ = () =>
      supabase
        .from('attendance')
        .select('student_id, type, timestamp')
        .in('student_id', studentIds)
        .gte('timestamp', queryStart.toISOString())
        .lte('timestamp', queryEnd.toISOString())
        .order('timestamp', { ascending: true });
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await baseQ().range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allExportAttendance = allExportAttendance.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const attendanceByStudent = groupById(allExportAttendance);

  const formatHHMM = (d: Date) =>
    d.toLocaleTimeString('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
    });

  const results: Array<{
    날짜: string;
    좌석번호: number | string;
    이름: string;
    입실시간: string;
    퇴실시간: string;
    학습시간: string;
  }> = [];

  for (const student of students) {
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    const attendance = attendanceByStudent[student.id] ?? [];

    for (const dateStr of studyDates) {
      const { start, end } = getStudyDayBounds(dateStr);
      const dayAttendance = attendance
        .filter((r) => {
          const t = new Date(r.timestamp);
          return t >= start && t <= end;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (dayAttendance.length === 0) continue;

      const sessions = extractStudySessions(dayAttendance, end);
      const studySeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
      const studyMinutes = Math.floor(studySeconds / 60);

      const firstCheckIn = dayAttendance.find((r) => r.type === 'check_in');
      const lastCheckOut = [...dayAttendance].reverse().find((r) => r.type === 'check_out');

      results.push({
        날짜: dateStr,
        좌석번호: student.seat_number || '',
        이름: profile?.name || '',
        입실시간: firstCheckIn ? formatHHMM(new Date(firstCheckIn.timestamp)) : '',
        퇴실시간: lastCheckOut ? formatHHMM(new Date(lastCheckOut.timestamp)) : '',
        학습시간: `${Math.floor(studyMinutes / 60)}시간 ${studyMinutes % 60}분`,
      });
    }
  }

  return results.sort((a, b) => {
    if (a.날짜 !== b.날짜) return a.날짜.localeCompare(b.날짜);
    return Number(a.좌석번호 || 0) - Number(b.좌석번호 || 0);
  });
}

// 몰입도 데이터 조회 (엑셀 다운로드용)
export async function getFocusDataForExport(startDate: string, endDate: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('focus_scores')
    .select(
      `
      *,
      student:student_id (
        seat_number,
        profiles!inner (name, withdrawn_at)
      ),
      admin:admin_id (name)
    `,
    )
    .is('student.profiles.withdrawn_at', null)
    .gte('recorded_at', startDate)
    .lte('recorded_at', endDate)
    .order('recorded_at', { ascending: false });

  return (data || []).map((f) => {
    const studentProfile = f.student
      ? Array.isArray(f.student.profiles)
        ? f.student.profiles[0]
        : f.student.profiles
      : null;

    return {
      날짜: new Date(f.recorded_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }),
      시간: new Date(f.recorded_at).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
      }),
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
    .select(
      `
      *,
      student:student_id (
        seat_number,
        profiles!inner (name, withdrawn_at)
      ),
      admin:admin_id (name)
    `,
    )
    .is('student.profiles.withdrawn_at', null)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false });

  return (data || []).map((p) => {
    const studentProfile = p.student
      ? Array.isArray(p.student.profiles)
        ? p.student.profiles[0]
        : p.student.profiles
      : null;

    return {
      날짜: new Date(p.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }),
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
    .select(
      `
      *,
      student:student_id (
        seat_number,
        profiles!inner (name)
      )
    `,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return (data || []).map((s) => {
    const studentProfile = s.student
      ? Array.isArray(s.student.profiles)
        ? s.student.profiles[0]
        : s.student.profiles
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

// 전체 관리자 목록 조회 (지점 정보 포함).
// branchId 명시 — RLS 정책 (모든 사용자가 admin profile SELECT 가능) 으로 못 막는 다른 지점 admin 누수 차단.
export async function getAllAdmins(branchId?: string | null) {
  const supabase = await createClient();

  let query = supabase
    .from('profiles')
    .select(
      `
      *,
      branch:branch_id (
        id,
        name
      )
    `,
    )
    .eq('user_type', 'admin')
    .order('created_at', { ascending: false });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching admins:', error);
    return [];
  }

  return (data || []).map((admin) => ({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    phone: admin.phone,
    branch_id: admin.branch_id,
    branch_name: admin.branch?.name || null,
    created_at: admin.created_at,
  }));
}

// =====================================================
// 회원 관리 — URL-first 검색·페이지네이션·정렬 변형 함수
// 활성 탭의 데이터만 받아오고, 탭 카운트와 학생 탭 보조 카운트는
// 별도 aggregate 호출로 분리. 검색·필터 변경은 URL 갱신 → 서버 컴포넌트
// 재실행으로 처리한다 (router.refresh 패턴).
// =====================================================

export interface MembersAggregates {
  // 탭 카운트 — 글로벌 (검색·필터 무시)
  studentTotal: number;
  parentTotal: number;
  adminTotal: number;
  // 승인 상태 그룹 — q + studentType (자기 그룹은 자기 무시)
  approval: { all: number; pending: number; approved: number; rejected: number };
  // 학생 타입 그룹 — q + approval (자기 그룹은 자기 무시)
  studentTypeAll: number;
  unassignedStudentCount: number;
  studentTypeCounts: Record<string, number>;
  // 학부모 미가입 학생 수 — q + approval + studentType 적용 (학부모 가입을 안 한 자녀가 있는 학생)
  unlinkedParentCount: number;
}

export async function getMembersAggregates({
  branchId,
  q,
  approval,
  studentType,
}: {
  branchId?: string | null;
  q?: string;
  approval?: 'pending' | 'approved' | 'rejected';
  studentType?: 'unassigned' | string;
}): Promise<MembersAggregates> {
  const supabase = await createClient();
  const adminClient = createAdminClient();
  const qs = (q ?? '').trim();
  const pat = qs ? escapeLike(qs) : null;

  // 1) 탭 총합 — q 적용 (검색이 어느 탭에 매칭되는지 한눈에). approval/studentType 는
  //    탭 전환 시 초기화되므로 적용하지 않음. 퇴원생은 모든 탭에서 제외.
  const tabAdminBase = () => {
    let qb = supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_type', 'admin')
      .is('withdrawn_at', null);
    if (branchId) qb = qb.eq('branch_id', branchId);
    if (pat) qb = qb.or(`name.ilike.%${pat}%,email.ilike.%${pat}%`);
    return qb;
  };

  const [adminTotalR] = await Promise.all([tabAdminBase()]);

  // 2) 학부모 탭 총합 — branch 학생 → 연결된 distinct 학부모 + q (학부모 본인 name/email)
  let parentTotal = 0;
  if (branchId) {
    const { data: branchStudents } = await adminClient
      .from('profiles')
      .select('id')
      .eq('user_type', 'student')
      .eq('branch_id', branchId)
      .is('withdrawn_at', null);
    const sids = (branchStudents ?? []).map((s) => s.id as string);
    if (sids.length > 0) {
      const { data: links } = await adminClient
        .from('parent_student_links')
        .select('parent_id')
        .in('student_id', sids);
      const allowedParentIds = [...new Set((links ?? []).map((l) => l.parent_id as string))];
      if (allowedParentIds.length > 0) {
        let pq = adminClient
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('user_type', 'parent')
          .is('withdrawn_at', null)
          .in('id', allowedParentIds);
        if (pat) pq = pq.or(`name.ilike.%${pat}%,email.ilike.%${pat}%`);
        const { count } = await pq;
        parentTotal = count ?? 0;
      }
    }
  } else {
    let pq = adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_type', 'parent')
      .is('withdrawn_at', null);
    if (pat) pq = pq.or(`name.ilike.%${pat}%,email.ilike.%${pat}%`);
    const { count } = await pq;
    parentTotal = count ?? 0;
  }

  // 3) 학생 그룹 baseline — 검색 적용된 행을 한 번에 받아 메모리 파티셔닝.
  //    studentTotal (탭 카운트) 도 이 baseline 의 count 로 노출.
  //    각 sub 그룹의 카운트는 "다른 그룹 필터 적용 + 자기 그룹 자기 무시" 정책.
  let baseQuery = supabase
    .from('profiles')
    .select('id, is_approved, is_rejected, student_profiles!inner (student_type_id)', {
      count: 'exact',
    })
    .eq('user_type', 'student')
    .is('withdrawn_at', null);
  if (branchId) baseQuery = baseQuery.eq('branch_id', branchId);
  if (pat) baseQuery = baseQuery.or(`name.ilike.%${pat}%,email.ilike.%${pat}%`);
  // 안전상 상한 — 지점당 학생 수가 수천 단위가 되면 paginate 로 전환 검토
  baseQuery = baseQuery.range(0, 9999);

  const { data: baseData, count: studentTotalCount, error: baseErr } = await baseQuery;
  if (baseErr) console.error('Error fetching members aggregates baseline:', baseErr);

  // 학부모 미가입 학생 식별: baseline 학생 ID 중 parent_student_links 에 매칭이 없는 학생.
  // 학부모 탭 칩 카운트와 실제 필터 결과 행수가 일치하도록 동일한 차집합 정의를 쓴다.
  const baselineStudentIds = ((baseData ?? []) as unknown as { id: string }[]).map((r) => r.id);
  let linkedSet: Set<string> = new Set();
  if (baselineStudentIds.length > 0) {
    const { data: linkRows } = await adminClient
      .from('parent_student_links')
      .select('student_id')
      .in('student_id', baselineStudentIds);
    linkedSet = new Set(((linkRows ?? []) as { student_id: string }[]).map((r) => r.student_id));
  }

  type BaseRow = {
    id: string;
    is_approved: boolean;
    is_rejected: boolean | null;
    student_profiles:
      | { student_type_id: string | null }
      | { student_type_id: string | null }[]
      | null;
  };
  const rows = ((baseData ?? []) as unknown as BaseRow[]).map((r) => {
    const sp = Array.isArray(r.student_profiles) ? r.student_profiles[0] : r.student_profiles;
    return {
      id: r.id,
      is_approved: r.is_approved,
      is_rejected: !!r.is_rejected,
      student_type_id: sp?.student_type_id ?? null,
      is_linked: linkedSet.has(r.id),
    };
  });

  const matchesStudentType = (row: (typeof rows)[number]): boolean => {
    if (!studentType) return true;
    if (studentType === 'unassigned') return row.student_type_id === null;
    return row.student_type_id === studentType;
  };
  const matchesApproval = (row: (typeof rows)[number]): boolean => {
    if (!approval) return true;
    if (approval === 'pending') return !row.is_approved && !row.is_rejected;
    if (approval === 'approved') return row.is_approved;
    if (approval === 'rejected') return row.is_rejected;
    return true;
  };

  // 승인 상태 그룹 — studentType 만 적용 (approval 자기 무시)
  let approvalAll = 0;
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const r of rows) {
    if (!matchesStudentType(r)) continue;
    approvalAll += 1;
    if (!r.is_approved && !r.is_rejected) pending += 1;
    else if (r.is_approved) approved += 1;
    else if (r.is_rejected) rejected += 1;
  }

  // 학생 타입 그룹 — approval 만 적용 (studentType 자기 무시)
  let studentTypeAll = 0;
  let unassignedStudentCount = 0;
  const studentTypeCounts: Record<string, number> = {};
  for (const r of rows) {
    if (!matchesApproval(r)) continue;
    studentTypeAll += 1;
    if (r.student_type_id === null) unassignedStudentCount += 1;
    else studentTypeCounts[r.student_type_id] = (studentTypeCounts[r.student_type_id] ?? 0) + 1;
  }

  // 학부모 미가입 그룹 — approval + studentType 적용 (parentLink 자기 무시).
  // 학생 탭 필터 칩에 노출되는 카운트로, getMembersList 의 parentLink='unlinked' 결과 수와 일치해야 한다.
  let unlinkedParentCount = 0;
  for (const r of rows) {
    if (!matchesApproval(r)) continue;
    if (!matchesStudentType(r)) continue;
    if (!r.is_linked) unlinkedParentCount += 1;
  }

  return {
    studentTotal: studentTotalCount ?? 0,
    parentTotal,
    adminTotal: adminTotalR.count ?? 0,
    approval: { all: approvalAll, pending, approved, rejected },
    studentTypeAll,
    unassignedStudentCount,
    studentTypeCounts,
    unlinkedParentCount,
  };
}

export interface MemberListRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  user_type: string;
  is_approved: boolean;
  is_rejected: boolean;
  created_at: string;
  branch_id: string | null;
  branch_name: string | null;
  seat_number: number | null;
  school: string | null;
  grade: number | null;
  student_type_id: string | null;
  parents: { id: string; name: string; phone: string | null }[];
}

// 학생 탭 — 검색·필터·정렬·페이지네이션 적용
export async function getMembersList(params: {
  branchId?: string | null;
  q?: string;
  page?: number;
  pageSize?: number;
  approval?: 'pending' | 'approved' | 'rejected';
  studentType?: 'unassigned' | string;
  /** 학부모 가입 여부 필터. 'unlinked'=학부모 미가입, 'linked'=가입됨. 미지정=전체. */
  parentLink?: 'unlinked' | 'linked';
  sort?: 'seat_number' | 'name' | 'branch_name' | 'created_at';
  dir?: 'asc' | 'desc';
}): Promise<{ rows: MemberListRow[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 30;
  const offset = (page - 1) * pageSize;
  const ascending = params.dir !== 'desc';

  let query = supabase
    .from('profiles')
    .select(
      `
      *,
      branch:branch_id (id, name),
      student_profiles!inner (seat_number, student_type_id)
    `,
      { count: 'exact' },
    )
    .eq('user_type', 'student')
    .is('withdrawn_at', null);

  if (params.branchId) query = query.eq('branch_id', params.branchId);

  const qs = (params.q ?? '').trim();
  if (qs) {
    const pat = escapeLike(qs);
    query = query.or(`name.ilike.%${pat}%,email.ilike.%${pat}%`);
  }

  switch (params.approval) {
    case 'pending':
      query = query.eq('is_approved', false).eq('is_rejected', false);
      break;
    case 'approved':
      query = query.eq('is_approved', true);
      break;
    case 'rejected':
      query = query.eq('is_rejected', true);
      break;
  }

  if (params.studentType === 'unassigned') {
    query = query.is('student_profiles.student_type_id', null);
  } else if (params.studentType) {
    query = query.eq('student_profiles.student_type_id', params.studentType);
  }

  // 학부모 가입 여부 필터. parent_student_links 매칭을 admin client 로 한 번 조회해
  // linked/unlinked 학생 ID 차집합을 메인 쿼리에 in() 적용한다 (aggregates 와 동일 정의).
  if (params.parentLink) {
    const adminForLinks = createAdminClient();
    const { data: linkRows } = await adminForLinks
      .from('parent_student_links')
      .select('student_id');
    const linkedIds = [
      ...new Set(((linkRows ?? []) as { student_id: string }[]).map((r) => r.student_id)),
    ];
    if (params.parentLink === 'unlinked') {
      if (linkedIds.length === 0) {
        // 모든 학생이 미연결 — 별도 필터 불필요
      } else {
        // PostgREST in.() not 필터: linkedIds 에 없는 학생만
        query = query.not('id', 'in', `(${linkedIds.join(',')})`);
      }
    } else if (params.parentLink === 'linked') {
      if (linkedIds.length === 0) {
        return { rows: [], total: 0, page, pageSize };
      }
      query = query.in('id', linkedIds);
    }
  }

  switch (params.sort) {
    case 'seat_number':
      query = query.order('seat_number', { foreignTable: 'student_profiles', ascending });
      break;
    case 'name':
      query = query.order('name', { ascending });
      break;
    case 'branch_name':
      query = query.order('name', { foreignTable: 'branch', ascending, nullsFirst: false });
      break;
    case 'created_at':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  query = query.range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error || !data) {
    console.error('Error fetching members list:', error);
    return { rows: [], total: 0, page, pageSize };
  }

  // 페이지 슬라이스 학생 ID → 연결된 학부모 배치 조회.
  // service-role 사용 이유: 학부모 profile 은 branch_id=NULL 이라 admin RLS 로 읽히지 않음.
  // 누수 차단: studentIds 자체가 RLS 걸린 본문 쿼리 결과라 admin branch 외 학생이 들어올 수 없음.
  const studentIds = (data as unknown as { id: string }[]).map((p) => p.id);
  const parentsByStudent: Record<string, { id: string; name: string; phone: string | null }[]> = {};

  if (studentIds.length > 0) {
    const adminClient = createAdminClient();

    const { data: links } = await adminClient
      .from('parent_student_links')
      .select('student_id, parent_id')
      .in('student_id', studentIds);

    const parentIds = [...new Set((links ?? []).map((l) => l.parent_id as string))];

    const parentMap: Record<string, { id: string; name: string; phone: string | null }> = {};
    if (parentIds.length > 0) {
      const { data: parentRows } = await adminClient
        .from('profiles')
        .select('id, name, phone')
        .in('id', parentIds)
        .is('withdrawn_at', null);

      for (const p of (parentRows ?? []) as Array<{
        id: string;
        name: string;
        phone: string | null;
      }>) {
        parentMap[p.id] = { id: p.id, name: p.name, phone: p.phone ?? null };
      }
    }

    for (const link of (links ?? []) as Array<{ student_id: string; parent_id: string }>) {
      const parent = parentMap[link.parent_id];
      if (!parent) continue;
      const arr = parentsByStudent[link.student_id] ?? [];
      arr.push(parent);
      parentsByStudent[link.student_id] = arr;
    }
  }

  type Row = {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    user_type: string;
    is_approved: boolean;
    is_rejected: boolean | null;
    created_at: string;
    branch_id: string | null;
    school: string | null;
    grade: number | null;
    branch: { name: string | null } | null;
    student_profiles:
      | { seat_number: number | null; student_type_id: string | null }
      | { seat_number: number | null; student_type_id: string | null }[]
      | null;
  };

  const rows = (data as unknown as Row[]).map((p) => {
    const sp = Array.isArray(p.student_profiles) ? p.student_profiles[0] : p.student_profiles;
    return {
      id: p.id,
      email: p.email,
      name: p.name,
      phone: p.phone,
      user_type: p.user_type,
      is_approved: p.is_approved,
      is_rejected: !!p.is_rejected,
      created_at: p.created_at,
      branch_id: p.branch_id,
      branch_name: p.branch?.name ?? null,
      seat_number: sp?.seat_number ?? null,
      student_type_id: sp?.student_type_id ?? null,
      school: p.school ?? null,
      grade: p.grade ?? null,
      parents: parentsByStudent[p.id] ?? [],
    };
  });

  return { rows, total: count ?? 0, page, pageSize };
}

export interface ParentListRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  user_type: string;
  created_at: string;
  students: {
    id: string;
    name: string;
    seatNumber: number | null;
    branchName: string | null;
  }[];
}

/**
 * 학부모 탭 정렬 키.
 *  - name, created_at: PostgREST order().range() 경로 (페이지 단위 정렬).
 *  - child_*: 자녀 다수일 때 SQL 단일 컬럼 정렬이 부정확하므로 메모리 정렬 → slice.
 *
 * 현재 운영 학부모 모수가 수백명 기준이라 메모리 정렬로 충분. 2,000명을
 * 넘어가면 캐시/Materialized View 도입을 재검토해야 한다.
 */
export type ParentSortField = 'name' | 'created_at' | 'child_seat' | 'child_name' | 'child_branch';

const koCollator = new Intl.Collator('ko');

function parentLinkChildBranchKey(students: ParentListRow['students']): string {
  const branches = [...new Set(students.map((s) => s.branchName).filter(Boolean))] as string[];
  if (branches.length === 0) return '';
  return [...branches].sort(koCollator.compare)[0];
}

function parentLinkChildNameKey(students: ParentListRow['students']): string {
  const names = students.map((s) => s.name).filter((n) => n && n !== '이름 없음');
  if (names.length === 0) return '';
  return [...names].sort(koCollator.compare)[0];
}

function parentLinkChildSeatKey(students: ParentListRow['students']): number {
  // NULL/0(미배정)은 무한대로 치환 — asc/desc 모두 값 있는 행이 먼저 오게 한다.
  // 표시 로직 ({s.seatNumber ? `${s.seatNumber}번` : '-'})과 일관되게 0도 미배정으로 본다.
  const seats = students
    .map((s) => s.seatNumber)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  if (seats.length === 0) return Infinity;
  return Math.min(...seats);
}

// 학부모 탭 — name/email 검색 + 정렬 + 페이지네이션. 학생명 검색은 placeholder 가
// 'name/email' 만 약속하므로 의도적으로 제외 (단순화 트레이드오프).
export async function getParentsList(params: {
  branchId?: string | null;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: ParentSortField;
  dir?: 'asc' | 'desc';
}): Promise<{ rows: ParentListRow[]; total: number; page: number; pageSize: number }> {
  const adminClient = createAdminClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 30;
  const offset = (page - 1) * pageSize;
  const sort: ParentSortField = params.sort ?? 'created_at';
  const dir: 'asc' | 'desc' = params.dir ?? 'desc';
  const ascending = dir === 'asc';
  const isMemorySort = sort === 'child_seat' || sort === 'child_name' || sort === 'child_branch';

  let allowedParentIds: string[] | null = null;
  if (params.branchId) {
    const { data: branchStudents } = await adminClient
      .from('profiles')
      .select('id')
      .eq('user_type', 'student')
      .eq('branch_id', params.branchId)
      .is('withdrawn_at', null);
    const sids = (branchStudents ?? []).map((s) => s.id as string);
    if (sids.length === 0) return { rows: [], total: 0, page, pageSize };
    const { data: links } = await adminClient
      .from('parent_student_links')
      .select('parent_id')
      .in('student_id', sids);
    allowedParentIds = [...new Set((links ?? []).map((l) => l.parent_id as string))];
    if (allowedParentIds.length === 0) return { rows: [], total: 0, page, pageSize };
  }

  let parentQuery = adminClient
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('user_type', 'parent')
    .is('withdrawn_at', null);

  // 정렬 키별 분기.
  //   - 경로 A (PostgREST): name/created_at → DB 정렬 + range 슬라이스.
  //   - 경로 B (메모리): child_* → 전체 학부모를 받아 자녀 정렬 키로 정렬 후 slice.
  if (!isMemorySort) {
    parentQuery = parentQuery.order(sort, { ascending });
  } else {
    // 메모리 정렬 경로에서도 동순위 안정성을 위해 created_at 보조키.
    parentQuery = parentQuery.order('created_at', { ascending: false });
  }

  if (allowedParentIds !== null) {
    parentQuery = parentQuery.in('id', allowedParentIds);
  }

  const qs = (params.q ?? '').trim();
  if (qs) {
    const pat = escapeLike(qs);
    parentQuery = parentQuery.or(`name.ilike.%${pat}%,email.ilike.%${pat}%`);
  }

  if (!isMemorySort) {
    parentQuery = parentQuery.range(offset, offset + pageSize - 1);
  }

  const { data: parents, count, error } = await parentQuery;
  if (error || !parents) {
    console.error('Error fetching parents list:', error);
    return { rows: [], total: 0, page, pageSize };
  }
  if (parents.length === 0) {
    return { rows: [], total: count ?? 0, page, pageSize };
  }

  const parentIds = parents.map((p) => p.id as string);

  const { data: allLinks } = await adminClient
    .from('parent_student_links')
    .select(
      `
      parent_id,
      student:student_id (
        id,
        seat_number,
        profiles!inner (name, branch_id, branch:branch_id (name))
      )
    `,
    )
    .in('parent_id', parentIds);

  type ParentLinkStudentProfile = {
    name: string | null;
    branch: { name: string | null } | { name: string | null }[] | null;
  };
  type ParentLinkStudent = {
    id: string;
    seat_number: number | null;
    profiles: ParentLinkStudentProfile | ParentLinkStudentProfile[] | null;
  };
  type ParentLinkRow = {
    parent_id: string;
    student: ParentLinkStudent | ParentLinkStudent[] | null;
  };

  const linksByParent: Record<string, ParentLinkRow[]> = {};
  for (const link of (allLinks ?? []) as ParentLinkRow[]) {
    const arr = linksByParent[link.parent_id] ?? [];
    arr.push(link);
    linksByParent[link.parent_id] = arr;
  }

  let rows: ParentListRow[] = parents.map((parent) => {
    const links = linksByParent[parent.id as string] ?? [];
    const students = links.map((link) => {
      const student = Array.isArray(link.student) ? link.student[0] : link.student;
      const studentProfile = student?.profiles
        ? Array.isArray(student.profiles)
          ? student.profiles[0]
          : student.profiles
        : null;
      const branch = studentProfile?.branch
        ? Array.isArray(studentProfile.branch)
          ? studentProfile.branch[0]
          : studentProfile.branch
        : null;
      return {
        id: student?.id || '',
        name: studentProfile?.name || '이름 없음',
        seatNumber: student?.seat_number ?? null,
        branchName: branch?.name ?? null,
      };
    });
    // 행 내부 자녀 정렬: seatNumber asc, name asc (좌석번호 없는 자녀는 뒤).
    // 학생번호·학생명 두 컬럼이 같은 자녀 인덱스로 매핑되어야 하므로 항상 동일 순서.
    students.sort((a, b) => {
      const sa = a.seatNumber ?? Infinity;
      const sb = b.seatNumber ?? Infinity;
      if (sa !== sb) return sa - sb;
      return koCollator.compare(a.name, b.name);
    });
    return {
      id: parent.id as string,
      email: parent.email as string,
      name: parent.name as string,
      phone: (parent.phone as string | null) ?? null,
      user_type: parent.user_type as string,
      created_at: parent.created_at as string,
      students,
    };
  });

  // 메모리 정렬 경로: 자녀 키로 정렬 후 페이지 슬라이스.
  if (isMemorySort) {
    const keyOf =
      sort === 'child_seat'
        ? (r: ParentListRow) => parentLinkChildSeatKey(r.students)
        : sort === 'child_name'
          ? (r: ParentListRow) => parentLinkChildNameKey(r.students)
          : (r: ParentListRow) => parentLinkChildBranchKey(r.students);
    rows.sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      // 빈값/Infinity는 desc/asc 모두 뒤로 보낸다 (값 있는 행을 먼저 보여주는 게 자연스러움).
      const emptyA = ka === '' || ka === Infinity;
      const emptyB = kb === '' || kb === Infinity;
      if (emptyA !== emptyB) return emptyA ? 1 : -1;
      if (emptyA && emptyB) return 0;
      let cmp: number;
      if (typeof ka === 'number' && typeof kb === 'number') {
        cmp = ka - kb;
      } else {
        cmp = koCollator.compare(String(ka), String(kb));
      }
      return ascending ? cmp : -cmp;
    });
    rows = rows.slice(offset, offset + pageSize);
  }

  return { rows, total: count ?? 0, page, pageSize };
}

export interface AdminListRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  branch_id: string | null;
  branch_name: string | null;
  is_super_admin: boolean;
  created_at: string;
}

// 관리자 탭 — name/email 검색 + 페이지네이션. 최고 관리자 전용.
// 가드 실패 시에도 page.tsx의 destructuring 호환을 위해 빈 결과 형태로 반환.
export async function getAdminsList(params: {
  branchId?: string | null;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: AdminListRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 30;

  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return { rows: [], total: 0, page, pageSize };
  }

  const supabase = await createClient();
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('profiles')
    .select(
      `
      *,
      branch:branch_id (id, name)
    `,
      { count: 'exact' },
    )
    .eq('user_type', 'admin')
    .is('withdrawn_at', null);

  if (params.branchId) query = query.eq('branch_id', params.branchId);

  const qs = (params.q ?? '').trim();
  if (qs) {
    const pat = escapeLike(qs);
    query = query.or(`name.ilike.%${pat}%,email.ilike.%${pat}%`);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error || !data) {
    console.error('Error fetching admins list:', error);
    return { rows: [], total: 0, page, pageSize };
  }

  type Row = {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    branch_id: string | null;
    is_super_admin: boolean;
    branch: { name: string | null } | null;
    created_at: string;
  };

  const rows = (data as unknown as Row[]).map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    phone: a.phone,
    branch_id: a.branch_id,
    branch_name: a.branch?.name ?? null,
    is_super_admin: !!a.is_super_admin,
    created_at: a.created_at,
  }));

  return { rows, total: count ?? 0, page, pageSize };
}

// ============================================
// 퇴원 회원 조회 (복구용)
// ============================================

export interface WithdrawnMemberRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  user_type: 'student' | 'parent' | 'admin';
  branch_id: string | null;
  branch_name: string | null;
  withdrawn_at: string;
  withdrawn_reason: string | null;
}

export async function getWithdrawnMembers(params: {
  branchId?: string | null;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: WithdrawnMemberRow[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 30;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('profiles')
    .select(`*, branch:branch_id (id, name)`, { count: 'exact' })
    .not('withdrawn_at', 'is', null);

  if (params.branchId) query = query.eq('branch_id', params.branchId);

  const qs = (params.q ?? '').trim();
  if (qs) {
    const pat = escapeLike(qs);
    query = query.or(`name.ilike.%${pat}%,email.ilike.%${pat}%`);
  }

  query = query.order('withdrawn_at', { ascending: false }).range(offset, offset + pageSize - 1);

  const { data, count, error } = await query;
  if (error || !data) {
    console.error('Error fetching withdrawn members:', error);
    return { rows: [], total: 0, page, pageSize };
  }

  type Row = {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    user_type: 'student' | 'parent' | 'admin';
    branch_id: string | null;
    branch: { name: string | null } | null;
    withdrawn_at: string;
    withdrawn_reason: string | null;
  };

  const rows = (data as unknown as Row[]).map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    phone: r.phone,
    user_type: r.user_type,
    branch_id: r.branch_id,
    branch_name: r.branch?.name ?? null,
    withdrawn_at: r.withdrawn_at,
    withdrawn_reason: r.withdrawn_reason,
  }));

  return { rows, total: count ?? 0, page, pageSize };
}

// ============================================
// 퇴원 학부모 / 관리자 상세 조회 (read-only)
// ============================================

export interface WithdrawnParentDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  branchId: string | null;
  branchName: string | null;
  createdAt: string;
  withdrawnAt: string | null;
  withdrawnBy: string | null;
  withdrawnByName: string | null;
  withdrawnReason: string | null;
  children: {
    id: string;
    name: string;
    branchName: string | null;
    seatNumber: number | null;
    withdrawnAt: string | null;
  }[];
}

export async function getWithdrawnParentDetail(
  parentId: string,
): Promise<WithdrawnParentDetail | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select(`*, branch:branch_id (id, name)`)
    .eq('id', parentId)
    .eq('user_type', 'parent')
    .maybeSingle();

  if (!profile) return null;

  type ProfileRow = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    branch_id: string | null;
    branch: { name: string | null } | null;
    created_at: string;
    withdrawn_at: string | null;
    withdrawn_by: string | null;
    withdrawn_reason: string | null;
  };
  const p = profile as unknown as ProfileRow;

  let withdrawnByName: string | null = null;
  if (p.withdrawn_by) {
    const { data: by } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', p.withdrawn_by)
      .maybeSingle();
    withdrawnByName = by?.name ?? null;
  }

  // 연결된 자녀 (퇴원 자녀 포함)
  const { data: links } = await supabase
    .from('parent_student_links')
    .select(
      `
      student:student_id (
        id,
        seat_number,
        profiles!inner (
          name,
          withdrawn_at,
          branch:branch_id ( name )
        )
      )
    `,
    )
    .eq('parent_id', parentId);

  type ChildRow = {
    student: {
      id: string;
      seat_number: number | null;
      profiles: {
        name: string | null;
        withdrawn_at: string | null;
        branch: { name: string | null } | null;
      } | null;
    } | null;
  };

  const children = ((links ?? []) as unknown as ChildRow[])
    .map((l) => {
      const s = l.student;
      if (!s) return null;
      const sp = s.profiles;
      if (!sp) return null;
      return {
        id: s.id,
        name: sp.name ?? '',
        branchName: sp.branch?.name ?? null,
        seatNumber: s.seat_number,
        withdrawnAt: sp.withdrawn_at,
      };
    })
    .filter(
      (
        c,
      ): c is {
        id: string;
        name: string;
        branchName: string | null;
        seatNumber: number | null;
        withdrawnAt: string | null;
      } => c !== null,
    );

  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    branchId: p.branch_id,
    branchName: p.branch?.name ?? null,
    createdAt: p.created_at,
    withdrawnAt: p.withdrawn_at,
    withdrawnBy: p.withdrawn_by,
    withdrawnByName,
    withdrawnReason: p.withdrawn_reason,
    children,
  };
}

export interface WithdrawnAdminDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  branchId: string | null;
  branchName: string | null;
  createdAt: string;
  withdrawnAt: string | null;
  withdrawnBy: string | null;
  withdrawnByName: string | null;
  withdrawnReason: string | null;
}

export async function getWithdrawnAdminDetail(
  adminId: string,
): Promise<WithdrawnAdminDetail | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select(`*, branch:branch_id (id, name)`)
    .eq('id', adminId)
    .eq('user_type', 'admin')
    .maybeSingle();

  if (!profile) return null;

  type ProfileRow = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    branch_id: string | null;
    branch: { name: string | null } | null;
    created_at: string;
    withdrawn_at: string | null;
    withdrawn_by: string | null;
    withdrawn_reason: string | null;
  };
  const p = profile as unknown as ProfileRow;

  let withdrawnByName: string | null = null;
  if (p.withdrawn_by) {
    const { data: by } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', p.withdrawn_by)
      .maybeSingle();
    withdrawnByName = by?.name ?? null;
  }

  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    branchId: p.branch_id,
    branchName: p.branch?.name ?? null,
    createdAt: p.created_at,
    withdrawnAt: p.withdrawn_at,
    withdrawnBy: p.withdrawn_by,
    withdrawnByName,
    withdrawnReason: p.withdrawn_reason,
  };
}

// ============================================
// 슈퍼관리자 헬퍼 (countActiveSuperAdmins만 유지 — requireSuperAdmin은 공용 모듈)
// ============================================

async function countActiveSuperAdmins(): Promise<number> {
  const adminClient = createAdminClient();
  const { count } = await adminClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_type', 'admin')
    .eq('is_super_admin', true)
    .is('withdrawn_at', null);
  return count ?? 0;
}

// 관리자 지점 변경 — 슈퍼관리자 전용. 대상이 슈퍼라면 특정 지점 매핑 거부 (NULL 로 비우는 것은 허용).
export async function updateAdminBranch(adminId: string, branchId: string | null) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { error: auth.error };

  const adminClient = createAdminClient();

  if (branchId !== null) {
    const { data: target } = await adminClient
      .from('profiles')
      .select('is_super_admin')
      .eq('id', adminId)
      .single();
    if (target?.is_super_admin) {
      return { error: '최고 관리자는 특정 지점에 묶을 수 없습니다. 먼저 권한을 회수해 주세요.' };
    }
  }

  const { error } = await adminClient
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

// 관리자 계정 생성 — 슈퍼관리자 전용. 슈퍼+지점 동시 지정은 거부 (DB CHECK와 동일 정책).
export async function createAdmin(data: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  branchId?: string;
  isSuperAdmin?: boolean;
}) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { error: auth.error };

  const isSuperReq = data.isSuperAdmin === true;
  if (isSuperReq && data.branchId) {
    return { error: '최고 관리자는 지점을 지정할 수 없습니다. 지점 없이 생성해 주세요.' };
  }

  const adminClient = createAdminClient();

  // 1. Supabase Auth에 사용자 생성 (Admin Client로 RLS 우회)
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true, // 이메일 확인 없이 바로 사용 가능
  });

  if (authError) {
    console.error('Error creating admin auth:', authError);
    if (
      authError.message.includes('already registered') ||
      authError.message.includes('already been registered')
    ) {
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
    branch_id: isSuperReq ? null : data.branchId || null,
    is_approved: true, // 관리자는 승인 불필요
    is_super_admin: isSuperReq,
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

// 관리자 계정 삭제 — 슈퍼관리자 전용. 마지막 슈퍼관리자 보호.
export async function deleteAdmin(adminId: string) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { error: auth.error };

  const adminClient = createAdminClient();

  // 자기 자신은 삭제할 수 없음
  if (adminId === auth.userId) {
    return { error: '자기 자신은 삭제할 수 없습니다.' };
  }

  // 삭제 대상이 관리자인지 + 슈퍼 여부 확인
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('user_type, name, is_super_admin')
    .eq('id', adminId)
    .single();

  if (!targetProfile || targetProfile.user_type !== 'admin') {
    return { error: '삭제 대상이 관리자가 아닙니다.' };
  }

  // 마지막 슈퍼관리자 보호
  if (targetProfile.is_super_admin) {
    const supers = await countActiveSuperAdmins();
    if (supers <= 1) {
      return { error: '마지막 최고 관리자는 삭제할 수 없습니다.' };
    }
  }

  try {
    // 1. student_absence_schedules에서 해당 관리자 참조 NULL 처리
    await adminClient
      .from('student_absence_schedules')
      .update({ created_by: null })
      .eq('created_by', adminId);

    await adminClient
      .from('student_absence_schedules')
      .update({ approved_by: null })
      .eq('approved_by', adminId);

    await adminClient
      .from('student_absence_schedules')
      .update({ rejected_by: null })
      .eq('rejected_by', adminId);

    // 2. profiles 삭제
    const { error: profileError } = await adminClient.from('profiles').delete().eq('id', adminId);

    if (profileError) {
      console.error('Error deleting admin profile:', profileError);
      return { error: '관리자 정보 삭제에 실패했습니다.' };
    }

    // 3. Auth 사용자 삭제
    const { error: authError } = await adminClient.auth.admin.deleteUser(adminId);

    if (authError) {
      console.error('Error deleting admin auth:', authError);
      return {
        success: true,
        warning: 'Auth 사용자 삭제에 실패했습니다. DB 정보는 삭제되었습니다.',
      };
    }

    revalidatePath('/admin/members');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteAdmin:', error);
    return { error: '관리자 삭제 중 오류가 발생했습니다.' };
  }
}

// 슈퍼관리자 권한 부여/회수 — 슈퍼관리자 전용. 회수 시 마지막 슈퍼 보호.
// 부여 시 branch_id 도 함께 NULL 로 정규화 (슈퍼는 전 지점 권한이므로 특정 지점 매핑 금지 — DB CHECK 와 동일 정책).
export async function setAdminSuperFlag(adminId: string, value: boolean) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { error: auth.error };

  if (!value) {
    // 회수: 마지막 슈퍼 보호. 본인 회수도 동일.
    const supers = await countActiveSuperAdmins();
    if (supers <= 1) {
      return { error: '마지막 최고 관리자의 권한은 회수할 수 없습니다.' };
    }
  }

  const adminClient = createAdminClient();
  const update: { is_super_admin: boolean; branch_id?: null } = { is_super_admin: value };
  if (value) update.branch_id = null;
  const { error } = await adminClient
    .from('profiles')
    .update(update)
    .eq('id', adminId)
    .eq('user_type', 'admin');

  if (error) {
    console.error('Error setting super_admin flag:', error);
    return { error: '최고 관리자 권한 변경에 실패했습니다.' };
  }

  revalidatePath('/admin/members');
  return { success: true };
}

// 본인 비밀번호 변경 — 현재 비밀번호 검증 후 새 비밀번호 적용.
// 검증은 cookie 비바인딩 raw client (anon, persistSession=false) 로 수행해 본 세션 영향 차단.
export async function updateMyPassword(currentPassword: string, newPassword: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: '로그인이 필요합니다.' };
  if (newPassword.length < 6) return { error: '새 비밀번호는 6자 이상이어야 합니다.' };
  if (currentPassword === newPassword) {
    return { error: '새 비밀번호가 현재 비밀번호와 같습니다.' };
  }

  const { createClient: createRawClient } = await import('@supabase/supabase-js');
  const verifyClient = createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
  const { error: verifyError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) return { error: '현재 비밀번호가 일치하지 않습니다.' };

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    console.error('Error updating own password:', updateError);
    return { error: '비밀번호 변경에 실패했습니다.' };
  }
  return { success: true };
}

// 다른 어드민 비밀번호 강제 재설정 — 슈퍼관리자 전용.
// 본인 비밀번호는 본 액션이 아닌 updateMyPassword 로 처리.
export async function resetAdminPassword(adminId: string, newPassword: string) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { error: auth.error };
  if (adminId === auth.userId) {
    return { error: '본인 비밀번호는 본인 변경 화면을 사용해 주세요.' };
  }
  if (newPassword.length < 6) return { error: '비밀번호는 6자 이상이어야 합니다.' };

  const adminClient = createAdminClient();
  const { data: target } = await adminClient
    .from('profiles')
    .select('user_type')
    .eq('id', adminId)
    .single();
  if (target?.user_type !== 'admin') {
    return { error: '대상이 관리자가 아닙니다.' };
  }

  const { error } = await adminClient.auth.admin.updateUserById(adminId, {
    password: newPassword,
  });
  if (error) {
    console.error('Error force-resetting admin password:', error);
    // user_not_found(404) — profiles 에는 있지만 auth.users 에 짝이 없는 고아 계정.
    // 과거 시드/테스트로 만들어진 미가입 더미 어드민일 가능성이 높음. 사용자에게 안내.
    if (error.status === 404 || error.code === 'user_not_found') {
      return {
        error:
          '인증 시스템에 등록되지 않은 어드민입니다. 정상 가입 절차로 만들어진 계정이 아니라 비밀번호 재설정이 불가능합니다. 회원관리에서 이 어드민을 삭제하고 다시 추가해 주세요.',
      };
    }
    return { error: 'Auth 비밀번호 재설정에 실패했습니다.' };
  }

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

// 몰입도 점수 프리셋 조회. branchId === null 은 슈퍼관리자의 "전 지점" 신호.
export async function getFocusScorePresets(branchId: string | null): Promise<FocusScorePreset[]> {
  const supabase = await createClient();

  let q = supabase
    .from('focus_score_presets')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;

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
  color: string = 'bg-primary',
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
    return { error: '프리셋 생성에 실패했습니다.' };
  }

  revalidatePath('/admin/focus');
  return { success: true, data };
}

// 몰입도 점수 프리셋 수정
export async function updateFocusScorePreset(
  id: string,
  data: { score?: number; label?: string; color?: string; sort_order?: number },
) {
  const supabase = await createClient();

  const { error } = await supabase.from('focus_score_presets').update(data).eq('id', id);

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
  /** 시스템 preset (자동 부여) 식별자. 'late_checkin' | 'early_checkout' 등. */
  code?: string | null;
  is_system?: boolean;
}

// 벌점 프리셋 조회. branchId === null 은 슈퍼관리자의 "전 지점" 신호.
export async function getPenaltyPresets(branchId: string | null): Promise<PenaltyPreset[]> {
  const supabase = await createClient();

  let q = supabase
    .from('penalty_presets')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;

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
  color: string = 'bg-red-500',
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
  code?: string | null;
  is_system?: boolean;
}

// 상점 프리셋 조회. branchId === null 은 슈퍼관리자의 "전 지점" 신호.
export async function getRewardPresets(branchId: string | null): Promise<RewardPreset[]> {
  const supabase = await createClient();

  let q = supabase
    .from('reward_presets')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;

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
  color: string = 'bg-green-500',
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

  const { error } = await supabase.from('reward_presets').update({ is_active: false }).eq('id', id);

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
  searchQuery?: string,
  statusFilter?: 'checked_in' | 'checked_out' | 'not_arrived',
) {
  const supabase = await createClient();

  const studyDate = targetDate ? new Date(targetDate + 'T12:00:00') : getStudyDate();
  const { start: todayStart, end: todayEnd } = getStudyDayBounds(studyDate);
  const todayStr = studyDate.toISOString().split('T')[0];
  const todayDayOfWeek = studyDate.getDay();

  // Step 1: 전체 학생 ID + seat_number 조회 — 퇴원생 제외 (브랜치/검색 필터 포함, seat_number 순)
  let allStudentsQuery = supabase
    .from('student_profiles')
    .select('id, seat_number, profiles!inner(branch_id, name)')
    .is('profiles.withdrawn_at', null)
    .order('seat_number', { ascending: true });
  if (branchId) allStudentsQuery = allStudentsQuery.eq('profiles.branch_id', branchId);
  if (searchQuery) allStudentsQuery = allStudentsQuery.ilike('profiles.name', `%${searchQuery}%`);

  const { data: allStudentRows, error: allStudentsError } = await allStudentsQuery;
  if (allStudentsError) {
    console.error('Error fetching students:', allStudentsError);
    return {
      data: [],
      total: 0,
      stats: { checkedIn: 0, checkedOut: 0, notYetArrived: 0 },
    };
  }
  if (!allStudentRows || allStudentRows.length === 0) {
    return {
      data: [],
      total: 0,
      stats: { checkedIn: 0, checkedOut: 0, notYetArrived: 0 },
    };
  }

  const allStudentIds = allStudentRows.map((s) => s.id);
  // seat_number 순서 인덱스 맵
  const seatOrderMap = new Map(allStudentRows.map((s, i) => [s.id, i]));

  // Step 2: 전체 학생 출석 기록 한 번에 조회 (통계 + 상태 계산에 재사용)
  let allStudentsAttendance: { student_id: string; type: string; timestamp: string }[] = [];
  {
    const baseQ = () =>
      supabase
        .from('attendance')
        .select('student_id, type, timestamp')
        .in('student_id', allStudentIds)
        .gte('timestamp', todayStart.toISOString())
        .lte('timestamp', todayEnd.toISOString())
        .order('timestamp', { ascending: true });
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await baseQ().range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allStudentsAttendance = allStudentsAttendance.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const allAttendanceByStudent = groupById(allStudentsAttendance);

  // Step 3: 전체 학생 상태 계산 + 통계 + 상태별 ID 맵
  // 외출(break_start) 상태는 활성 학습 세션 중이므로 입실(checked_in) 으로 합산한다.
  let globalCheckedIn = 0,
    globalCheckedOut = 0,
    globalNotYetArrived = 0;
  const statusIdMap: Record<string, string[]> = {
    checked_in: [],
    checked_out: [],
    not_arrived: [],
  };

  for (const sid of allStudentIds) {
    const records = allAttendanceByStudent[sid] ?? [];
    if (records.length === 0) {
      globalNotYetArrived++;
      statusIdMap['not_arrived'].push(sid);
    } else {
      const lastRecord = records[records.length - 1];
      if (
        lastRecord.type === 'check_in' ||
        lastRecord.type === 'break_end' ||
        lastRecord.type === 'break_start'
      ) {
        globalCheckedIn++;
        statusIdMap['checked_in'].push(sid);
      } else {
        globalCheckedOut++;
        statusIdMap['checked_out'].push(sid);
      }
    }
  }
  let globalStats = {
    checkedIn: globalCheckedIn,
    checkedOut: globalCheckedOut,
    notYetArrived: globalNotYetArrived,
  };

  // 검색 필터가 없는 경우 카드 통계는 SQL 단일 쿼리(count_attendance_status)로 얻어와
  // JS reduce 결과와 동일성을 보장하면서 가드(admin/branch) 가 적용되도록 한다.
  // 검색어가 있을 때는 "검색된 학생들의 stats" 라는 현행 UX 를 유지하기 위해 reduce 결과를 그대로 사용.
  if (!searchQuery && branchId) {
    const { data: rpcStats } = await supabase.rpc('count_attendance_status', {
      p_branch_id: branchId,
      p_target_date: todayStr,
    });
    const r = rpcStats?.[0];
    if (r) {
      globalStats = {
        checkedIn: (r.checked_in ?? 0) + (r.on_break ?? 0),
        checkedOut: r.checked_out,
        notYetArrived: r.not_yet_arrived,
      };
    }
  }

  // Step 4: 상태 필터 적용 후 seat_number 순 정렬
  const filteredIds = statusFilter ? (statusIdMap[statusFilter] ?? []) : allStudentIds;
  filteredIds.sort((a, b) => (seatOrderMap.get(a) ?? 999) - (seatOrderMap.get(b) ?? 999));
  const filteredTotal = filteredIds.length;

  // Step 5: 필터 적용 전원 (한 번에 조회)
  const pageStudentIds = filteredIds;

  if (pageStudentIds.length === 0) {
    return { data: [], total: filteredTotal, stats: globalStats };
  }

  // Step 6: 학생 프로필 + 상세 데이터 조회
  //
  // 연관 데이터 쿼리는 Supabase 기본 1000행 한도에 걸려 조용히 잘리지 않도록 fetchAllPaged로 감싸고,
  // 부재 스케줄은 DB 레벨에서 "오늘 해당" + "승인됨"으로 좁혀 네트워크 낭비와 한도 부담을 동시에 제거한다.
  type AbsenceRow = {
    student_id: string;
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    is_recurring: boolean;
    specific_date: string | null;
    day_of_week: number[] | null;
    valid_from: string | null;
    valid_until: string | null;
  };

  const [{ data: students }, allAbsenceSchedules, allFocusScores, allPenalties] = await Promise.all(
    [
      supabase
        .from('student_profiles')
        .select(
          `
        id,
        seat_number,
        profiles!inner (id, name, email, phone, branch_id)
      `,
        )
        .in('id', pageStudentIds),
      fetchAllPaged<AbsenceRow>((from, to) =>
        supabase
          .from('student_absence_schedules')
          .select(
            'student_id, id, title, start_time, end_time, is_recurring, specific_date, day_of_week, valid_from, valid_until',
          )
          .in('student_id', pageStudentIds)
          .eq('is_active', true)
          .eq('status', 'approved')
          .or(`is_recurring.eq.true,specific_date.eq.${todayStr}`)
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllPaged<{ student_id: string; score: number }>((from, to) =>
        supabase
          .from('focus_scores')
          .select('student_id, score')
          .in('student_id', pageStudentIds)
          .gte('recorded_at', todayStart.toISOString())
          .lte('recorded_at', todayEnd.toISOString())
          .order('recorded_at', { ascending: true })
          .range(from, to),
      ),
      fetchAllPaged<{ student_id: string; amount: number }>((from, to) =>
        supabase
          .from('points')
          .select('student_id, amount')
          .in('student_id', pageStudentIds)
          .eq('type', 'penalty')
          .gte('created_at', todayStart.toISOString())
          .lte('created_at', todayEnd.toISOString())
          .order('created_at', { ascending: true })
          .range(from, to),
      ),
    ],
  );

  const absenceByStudent = groupById(allAbsenceSchedules);
  const focusByStudent = groupById(allFocusScores);
  const penaltyByStudent = groupById(allPenalties);

  // Step 7: 데이터 조합 (출석 기록은 Step 2에서 조회한 전체 데이터 재사용)
  const attendanceData = (students || []).map((student) => {
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    const attendance = allAttendanceByStudent[student.id] ?? [];

    let status: 'checked_in' | 'checked_out' | 'on_break' = 'checked_out';
    let firstCheckInTime: string | null = null;
    let lastCheckOutTime: string | null = null;

    if (attendance.length > 0) {
      const firstCheckIn = attendance.find((a) => a.type === 'check_in');
      if (firstCheckIn) firstCheckInTime = firstCheckIn.timestamp;

      const lastRecord = attendance[attendance.length - 1];
      if (lastRecord.type === 'check_in') status = 'checked_in';
      else if (lastRecord.type === 'check_out') {
        status = 'checked_out';
        lastCheckOutTime = lastRecord.timestamp;
      } else if (lastRecord.type === 'break_start') status = 'on_break';
      else if (lastRecord.type === 'break_end') status = 'checked_in';
    }

    const absenceSchedules = absenceByStudent[student.id] ?? [];
    const todayAbsenceSchedules = absenceSchedules.filter((schedule) => {
      if (schedule.valid_from && todayStr < schedule.valid_from) return false;
      if (schedule.valid_until && todayStr > schedule.valid_until) return false;
      if (!schedule.is_recurring) return schedule.specific_date === todayStr;
      if (schedule.day_of_week && !schedule.day_of_week.includes(todayDayOfWeek)) return false;
      return true;
    });

    const focusScores = focusByStudent[student.id] ?? [];
    const avgFocus =
      focusScores.length > 0
        ? Math.round((focusScores.reduce((sum, f) => sum + f.score, 0) / focusScores.length) * 10) /
          10
        : null;

    const todayPenalty = (penaltyByStudent[student.id] ?? []).reduce((sum, p) => sum + p.amount, 0);

    // 당일 순공시간(분) — 주간 뷰와 동일 알고리즘. 미퇴실은 min(now, todayEnd)까지 누적.
    let todayStudyMinutes = 0;
    let tempStart: Date | null = null;
    for (const record of attendance) {
      const ts = new Date(record.timestamp);
      if (record.type === 'check_in' || record.type === 'break_end') {
        tempStart = ts;
      } else if (record.type === 'check_out' || record.type === 'break_start') {
        if (tempStart) {
          todayStudyMinutes += Math.floor((ts.getTime() - tempStart.getTime()) / 60000);
          tempStart = null;
        }
      }
    }
    if (tempStart) {
      const endMs = Math.min(Date.now(), todayEnd.getTime());
      if (endMs > tempStart.getTime()) {
        todayStudyMinutes += Math.floor((endMs - tempStart.getTime()) / 60000);
      }
    }

    return {
      id: student.id,
      seatNumber: student.seat_number,
      name: profile?.name || '이름 없음',
      status,
      firstCheckInTime,
      lastCheckOutTime,
      absenceSchedules: todayAbsenceSchedules.map((s) => ({
        id: s.id,
        title: s.title,
        startTime: s.start_time?.slice(0, 5),
        endTime: s.end_time?.slice(0, 5),
      })),
      avgFocus,
      todayPenalty,
      focusCount: focusScores.length,
      todayStudyMinutes,
    };
  });

  // seat_number 순으로 정렬
  attendanceData.sort((a, b) => (a.seatNumber ?? 999) - (b.seatNumber ?? 999));

  return { data: attendanceData, total: filteredTotal, stats: globalStats };
}

// 주간 출석 데이터 조회 (학생별 7일간 출석 상태)
export async function getWeeklyAttendance(
  weekStartDate: string,
  branchId?: string | null,
  searchQuery?: string,
) {
  const supabase = await createClient();

  // KST 달력 주: 월 00:00 ~ 다음 주 월 00:00 (주간 상점 크론과 동일)
  const dates = getWeekDateStringsFromMondayKST(weekStartDate);
  const { start: weekStart, endExclusive: weekEndExclusive } =
    getCalendarWeekBoundsKST(weekStartDate);

  // 학생 프로필 전체 조회 (Supabase 행 제한 대비 배치)
  const STUDENT_BATCH = 1000;
  let students: {
    id: string;
    seat_number: number | null;
    profiles:
      | { id: string; name: string | null; branch_id: string | null }
      | { id: string; name: string | null; branch_id: string | null }[];
  }[] = [];
  let total = 0;
  let spOffset = 0;

  while (true) {
    let query = supabase
      .from('student_profiles')
      .select(
        `
      id,
      seat_number,
      profiles!inner (
        id,
        name,
        branch_id
      )
    `,
        { count: spOffset === 0 ? 'exact' : undefined },
      )
      .is('profiles.withdrawn_at', null)
      .order('seat_number', { ascending: true });

    if (branchId) {
      query = query.eq('profiles.branch_id', branchId);
    }

    if (searchQuery) {
      query = query.ilike('profiles.name', `%${searchQuery}%`);
    }

    const { data: batch, error, count } = await query.range(spOffset, spOffset + STUDENT_BATCH - 1);

    if (error) {
      console.error('Error fetching students:', error);
      return { students: [], dates: [], total: 0 };
    }

    if (spOffset === 0 && count != null) {
      total = count;
    }

    if (!batch?.length) break;

    students = students.concat(batch);
    if (batch.length < STUDENT_BATCH) break;
    spOffset += STUDENT_BATCH;
  }

  const studentIds = (students || []).map((s) => s.id);

  // 해당 기간의 모든 출석 기록 + 전체 누적 벌점 병렬 조회
  type WeeklyAttendanceRow = { student_id: string; type: string; timestamp: string };
  let allAttendance: WeeklyAttendanceRow[] = [];
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from('attendance')
        .select('student_id, type, timestamp')
        .in('student_id', studentIds)
        .gte('timestamp', weekStart.toISOString())
        .lt('timestamp', weekEndExclusive.toISOString())
        .order('timestamp', { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      allAttendance = allAttendance.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  // 전체 누적 벌점/상점 조회 (기간 제한 없이 전체) — 1000행 한도 대비 페이징
  const allPoints = await fetchAllPaged<{ student_id: string; amount: number; type: string }>(
    (from, to) =>
      supabase
        .from('points')
        .select('student_id, amount, type')
        .in('student_id', studentIds)
        .order('created_at', { ascending: true })
        .range(from, to),
  );

  const penaltyByStudent = groupById(allPoints.filter((p) => p.type === 'penalty'));
  const rewardByStudent = groupById(allPoints.filter((p) => p.type === 'reward'));

  // 각 학생별 주간 데이터 생성
  const weeklyData = (students || []).map((student) => {
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;

    // 각 날짜별 출석 상태 계산
    const dailyStatus: Record<
      string,
      {
        status: 'attended' | 'not_attended' | 'on_break' | null;
        checkInTime: string | null;
      }
    > = {};

    // 해당 주 학습시간 계산 (attendance 기록에서 직접 계산)
    let weeklyStudyMinutes = 0;
    let tempCheckIn: Date | null = null;

    const studentWeekAttendance = (allAttendance || []).filter((a) => a.student_id === student.id);

    for (const record of studentWeekAttendance) {
      const ts = new Date(record.timestamp);
      switch (record.type) {
        case 'check_in':
        case 'break_end':
          tempCheckIn = ts;
          break;
        case 'check_out':
        case 'break_start':
          if (tempCheckIn) {
            weeklyStudyMinutes += Math.floor((ts.getTime() - tempCheckIn.getTime()) / 60000);
            tempCheckIn = null;
          }
          break;
      }
    }
    // 아직 퇴실 안 한 경우: 현재 시각까지(단, 해당 주가 끝났으면 주간 종료 시각까지)
    if (tempCheckIn) {
      const nowMs = Date.now();
      const capMs = weekEndExclusive.getTime();
      const endMs = Math.min(nowMs, capMs);
      if (endMs > tempCheckIn.getTime()) {
        weeklyStudyMinutes += Math.floor((endMs - tempCheckIn.getTime()) / 60000);
      }
    }

    const todayStr = getTodayKST();

    dates.forEach((dateStr) => {
      const { start: dayStart, end: dayEnd } = getStudyDayBounds(dateStr);

      // 해당 날짜의 출석 기록 필터링
      const dayAttendance = studentWeekAttendance.filter(
        (a) => new Date(a.timestamp) >= dayStart && new Date(a.timestamp) <= dayEnd,
      );

      if (dayAttendance.length === 0) {
        // 미래 날짜인 경우 null, 과거 날짜인 경우 not_attended
        dailyStatus[dateStr] = {
          status: dateStr > todayStr ? null : 'not_attended',
          checkInTime: null,
        };
      } else {
        // 첫 입실 시간
        const firstCheckIn = dayAttendance.find((a) => a.type === 'check_in');

        // 입실 기록이 있으면 attended
        dailyStatus[dateStr] = {
          status: firstCheckIn ? 'attended' : 'not_attended',
          checkInTime: firstCheckIn?.timestamp || null,
        };
      }
    });

    // 전체 누적 벌점 / 상점
    const totalPenalty = (penaltyByStudent[student.id] ?? []).reduce((sum, p) => sum + p.amount, 0);
    const totalReward = (rewardByStudent[student.id] ?? []).reduce((sum, p) => sum + p.amount, 0);

    return {
      id: student.id,
      seatNumber: student.seat_number,
      name: profile?.name || '이름 없음',
      dailyStatus,
      weeklyStudyMinutes,
      totalPenalty,
      totalReward,
    };
  });

  return {
    students: weeklyData,
    dates,
    total: total || students.length,
  };
}

// 일괄 몰입도 점수 입력
export async function recordFocusScoreBatch(
  studentIds: string[],
  score: number,
  periodId?: string,
  note?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const inserts = studentIds.map((studentId) => ({
    student_id: studentId,
    admin_id: user.id,
    score,
    note,
    period_id: periodId || null,
  }));

  const { error } = await supabase.from('focus_scores').insert(inserts);

  if (error) {
    console.error('Error recording batch focus:', error);
    return { error: '일괄 몰입도 기록에 실패했습니다.' };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/focus');
  return { success: true, count: studentIds.length };
}

// 오늘 교시별 몰입도 데이터 조회
export async function getTodayFocusScoresByPeriod(branchId?: string | null, targetDate?: string) {
  const supabase = await createClient();

  const studyDate = targetDate ? new Date(targetDate + 'T00:00:00.000Z') : getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  // 브랜치 필터가 있으면 해당 브랜치 학생 ID 목록 먼저 조회
  let studentIds: string[] | null = null;
  if (branchId) {
    const { data: branchStudents } = await supabase
      .from('student_profiles')
      .select('id, profiles!inner(branch_id)')
      .eq('profiles.branch_id', branchId)
      .is('profiles.withdrawn_at', null);
    studentIds = branchStudents?.map((s) => s.id) || [];
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
  const result: Record<
    string,
    Record<string, { score: number; note: string | null; id: string }>
  > = {};
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
  note?: string,
  targetDate?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const studyDate = targetDate ? new Date(targetDate + 'T12:00:00+09:00') : getStudyDate();
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
    const { error } = await supabase.from('focus_scores').insert({
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

  return { success: true };
}

// 몰입도 점수 삭제 (취소)
export async function deleteFocusScore(studentId: string, periodId: string, targetDate?: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const studyDate = targetDate ? new Date(targetDate + 'T12:00:00+09:00') : getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { error } = await supabase
    .from('focus_scores')
    .delete()
    .eq('student_id', studentId)
    .eq('period_id', periodId)
    .gte('recorded_at', start.toISOString())
    .lte('recorded_at', end.toISOString());

  if (error) {
    console.error('Error deleting focus score:', error);
    return { error: '몰입도 삭제에 실패했습니다.' };
  }

  return { success: true };
}

// 일괄 벌점 부여
export async function givePointsBatch(
  studentIds: string[],
  type: 'reward' | 'penalty',
  amount: number,
  reason: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const inserts = studentIds.map((studentId) => ({
    student_id: studentId,
    admin_id: user.id,
    type,
    amount,
    reason,
    is_auto: false,
  }));

  const { error } = await supabase.from('points').insert(inserts);

  if (error) {
    console.error('Error giving batch points:', error);
    return { error: '일괄 상벌점 부여에 실패했습니다.' };
  }

  // 알림 발송 — 학생 이름 사전 일괄 조회로 N+1 회피, fire-and-forget.
  const { notifyPointsGranted } = await import('./notification');
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', studentIds);
  const nameById = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id: string; name: string | null }>) {
    nameById.set(p.id, p.name ?? '');
  }
  for (const studentId of studentIds) {
    notifyPointsGranted({
      studentId,
      type,
      amount,
      reason,
      studentName: nameById.get(studentId) || undefined,
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

// 회원 퇴원 처리 — soft delete (모의고사·결제·CAPS 이력 보존).
//
// 학생: profiles.withdrawn_at + Auth ban + push token 정리.
// 학부모:
//   - 활성 자녀가 1명 이상 있으면 학부모 본인은 ban 하지 않고 withdrawn_at 도 세팅하지 않는다.
//     (그렇게 하면 미들웨어가 학부모를 /account/withdrawn 으로 가두어 활성 자녀 출결을 못 보게 됨.)
//     대신 parent_student_links 만 모두 정리해 "한 학생을 퇴원" 시킨 효과를 얻는다.
//     실제 학부모 계정 종료가 필요하면 활성 자녀를 모두 퇴원·연결 해제한 뒤 다시 호출하면 된다.
//   - 활성 자녀가 0명이면 학생과 동일하게 withdrawn_at + ban + push token 정리.
export async function deleteMember(
  userId: string,
  userType: 'student' | 'parent',
  reason?: string,
) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    if (userType === 'parent') {
      // 활성 자녀가 1명이라도 있으면 학부모 탈퇴를 막는다.
      // 자녀 연결만 끊고 학부모만 남기는 과거 동작은 자녀 입장에서 학부모가 사라지는 효과라
      // (채팅·알림톡·앱 노출 모두 끊김) 데이터·UX 일관성을 깬다.
      // 클라이언트가 자녀들을 먼저 탈퇴 처리한 뒤 학부모를 탈퇴시키도록 강제한다.
      const { data: links } = await adminClient
        .from('parent_student_links')
        .select('student_id')
        .eq('parent_id', userId);
      const studentIds = (links ?? []).map((l) => l.student_id as string);

      if (studentIds.length > 0) {
        const { data: activeChildren } = await adminClient
          .from('profiles')
          .select('id, name')
          .in('id', studentIds)
          .is('withdrawn_at', null);
        const activeChildCount = activeChildren?.length ?? 0;

        if (activeChildCount > 0) {
          const childNames = (activeChildren ?? [])
            .map((c) => c.name as string)
            .filter(Boolean)
            .slice(0, 5)
            .join(', ');
          const more = activeChildCount > 5 ? ` 외 ${activeChildCount - 5}명` : '';
          return {
            error:
              `연결된 활성 자녀(${activeChildCount}명: ${childNames}${more})가 있어 학부모 계정은 탈퇴할 수 없습니다. ` +
              `자녀를 모두 탈퇴 처리한 뒤 다시 시도해 주세요.`,
          };
        }
      }
    }

    const result = await softDeleteUser({
      userId,
      withdrawnBy: user.id,
      reason,
    });

    if ('error' in result) {
      return { error: result.error };
    }

    revalidatePath('/admin');
    revalidatePath('/admin/members');

    if (result.warning) {
      return { success: true, warning: result.warning };
    }
    return { success: true };
  } catch (error) {
    console.error('Error in deleteMember:', error);
    return { error: '회원 탈퇴 처리 중 오류가 발생했습니다.' };
  }
}

// 퇴원 처리된 회원을 복구한다. withdrawn_at 을 NULL 로 되돌리고 Auth ban 을 해제한다.
export async function restoreMember(userId: string) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (adminProfile?.user_type !== 'admin') {
    return { error: '관리자만 회원을 복구할 수 있습니다.' };
  }

  try {
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        withdrawn_at: null,
        withdrawn_by: null,
        withdrawn_reason: null,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error restoring profile:', updateError);
      return { error: '회원 복구에 실패했습니다.' };
    }

    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    });

    if (authError) {
      console.error('Error unbanning auth user:', authError);
      return {
        success: true,
        warning: '계정 차단 해제(Auth unban)에 실패했습니다. 수동 확인이 필요합니다.',
      };
    }

    revalidatePath('/admin');
    revalidatePath('/admin/members');
    return { success: true };
  } catch (error) {
    console.error('Error in restoreMember:', error);
    return { error: '회원 복구 처리 중 오류가 발생했습니다.' };
  }
}

// ============================================
// 핸드폰 제출 관리
// ============================================

export type PhoneSubmissionStatus = 'submitted' | 'not_submitted' | 'none';

export type PhoneSubmissionMap = Record<string, PhoneSubmissionStatus>;

export async function getPhoneSubmissions(
  date: string,
  branchId?: string | null,
): Promise<PhoneSubmissionMap> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('phone_submissions')
    .select('student_id, status')
    .eq('date', date);

  if (error) {
    console.error('Error fetching phone submissions:', error);
    return {};
  }

  const map: PhoneSubmissionMap = {};
  for (const row of data || []) {
    map[row.student_id] = row.status as PhoneSubmissionStatus;
  }
  return map;
}

export async function setPhoneSubmission(
  studentId: string,
  date: string,
  status: PhoneSubmissionStatus,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('phone_submissions')
    .upsert(
      { student_id: studentId, date, status, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,date' },
    );

  if (error) {
    console.error('Error setting phone submission:', error);
    return { error: '핸드폰 제출 상태 변경에 실패했습니다.' };
  }

  return { success: true };
}

const PHONE_SUBMISSION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function clearPhoneSubmissionsForDate(
  date: string,
): Promise<{ success?: true; deleted?: number; error?: string }> {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (adminProfile?.user_type !== 'admin') {
    return { error: '관리자만 초기화할 수 있습니다.' };
  }

  if (!PHONE_SUBMISSION_DATE_RE.test(date)) {
    return { error: '날짜 형식이 올바르지 않습니다.' };
  }

  const { data: deleted, error } = await adminClient
    .from('phone_submissions')
    .delete()
    .eq('date', date)
    .select('student_id');

  if (error) {
    console.error('Error clearing phone submissions:', error);
    return { error: '휴대폰 제출 기록 초기화에 실패했습니다.' };
  }

  revalidatePath('/admin/focus');
  return { success: true, deleted: deleted?.length ?? 0 };
}
