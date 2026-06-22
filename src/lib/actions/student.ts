'use server';

import { createClient, verifyCurrentPassword } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  getStudyDate,
  getStudyDayBounds,
  getWeekStart,
  formatDateKST,
  getWeekDateStringsFromMondayKST,
} from '@/lib/utils';
import { REWARD_RULES } from '@/lib/constants';
import { calculateUnclassifiedMetrics } from '@/lib/study/unclassified';
import { extractStudySessions, isStudyExcluded, sumStudySeconds } from '@/lib/study-time';
import { evaluateAttendancePenalty } from '@/lib/attendance/penalty';
import {
  getRewardPresets,
  getPenaltyPresets,
  type RewardPreset,
  type PenaltyPreset,
} from './admin';
import { softDeleteUser } from '@/lib/withdraw';

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

// 학생의 오늘(학습일 기준) 입실/퇴실 기록 조회
export async function getTodayAttendance() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { attendance: [], status: 'checked_out' as const };

  // 학습일 기준으로 조회 (06:00 ~ 다음날 03:00)
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

  // 직원/경비 게이트(소프트 제외) 기록은 상태/세션 계산에서 배제
  const studyAttendance = (attendance ?? []).filter((r) => !isStudyExcluded(r));

  // 현재 상태 계산
  let status: 'checked_in' | 'checked_out' | 'on_break' = 'checked_out';
  if (studyAttendance.length > 0) {
    const lastRecord = studyAttendance[studyAttendance.length - 1];
    if (lastRecord.type === 'check_in') status = 'checked_in';
    else if (lastRecord.type === 'check_out') status = 'checked_out';
    else if (lastRecord.type === 'break_start') status = 'on_break';
    else if (lastRecord.type === 'break_end') status = 'checked_in';
  }

  return { attendance: studyAttendance, status };
}

// 오늘(학습일 기준)의 학습시간 계산 (초 단위)
export async function getTodayStudyTime() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { totalSeconds: 0, checkInTime: null };

  // 학습일 기준으로 조회 (06:00 ~ 다음날 03:00)
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

  // 직원/경비 게이트(소프트 제외) 기록은 순공 계산에서 배제
  for (const record of attendance.filter((r) => !isStudyExcluded(r))) {
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
    checkInTime: checkInTime ? checkInTime.toISOString() : null,
  };
}

// 주간 출석 현황 조회 (DAY_CONFIG.weekStartsOn 기준)
// attendance 테이블의 check_in 기록 기반으로 출석 여부 판단
export async function getWeeklyGoals(studentId?: string) {
  const supabase = await createClient();

  let targetStudentId = studentId;

  if (!targetStudentId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    targetStudentId = user.id;
  }

  // 이번 주 시작일 (DAY_CONFIG 기준)
  const startOfWeek = getWeekStart();
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  // 이번 주의 출석(check_in) 기록 조회
  const { data: attendanceRecords } = await supabase
    .from('attendance')
    .select('timestamp')
    .eq('student_id', targetStudentId)
    .eq('type', 'check_in')
    .gte('timestamp', startOfWeek.toISOString())
    .lt('timestamp', endOfWeek.toISOString())
    .order('timestamp', { ascending: true });

  // 출석한 날짜 Set 생성 (YYYY-MM-DD)
  const attendedDates = new Set<string>();
  if (attendanceRecords) {
    for (const record of attendanceRecords) {
      const dateStr = new Date(record.timestamp).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Seoul',
      }); // YYYY-MM-DD KST
      attendedDates.add(dateStr);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 7일간의 데이터 생성
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD KST

    const attended = attendedDates.has(dateStr);

    weekDays.push({
      date: date.toISOString(),
      // 출석한 날: true, 오늘 이후(미래): null, 과거 미출석: false
      achieved: attended ? true : date <= today ? false : null,
    });
  }

  return weekDays;
}

// 입실 처리
export async function checkIn() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('attendance').insert({
    student_id: user.id,
    type: 'check_in',
    source: 'manual',
  });

  if (error) {
    console.error('Error checking in:', error);
    return { error: '입실 처리에 실패했습니다.' };
  }

  // 지각 자동 벌점 평가 (비동기 — 입실 처리에는 영향 없음).
  // 지점 시스템 프리셋의 auto_enabled=true 일 때만 실제 부과된다.
  evaluateAttendancePenalty({
    supabase,
    studentId: user.id,
    type: 'late',
    at: new Date(),
  }).catch(console.error);

  revalidatePath('/student');
  return { success: true };
}

// 퇴실 처리
export async function checkOut() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 조기퇴실 자동 벌점 평가 (비동기 — 퇴실 처리에는 영향 없음).
  // 지점 시스템 프리셋의 auto_enabled=true 일 때만 실제 부과된다.
  evaluateAttendancePenalty({
    supabase,
    studentId: user.id,
    type: 'early',
    at: new Date(),
  }).catch(console.error);

  // 현재 학습 중인 과목 자동 종료
  await supabase
    .from('subjects')
    .update({ is_current: false, ended_at: new Date().toISOString() })
    .eq('student_id', user.id)
    .eq('is_current', true);

  const { error } = await supabase.from('attendance').insert({
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase.from('attendance').insert({
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      const { error: checkOutError } = await supabase.from('attendance').insert({
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
      const { error: checkInError } = await supabase.from('attendance').insert({
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
  const { error } = await supabase.from('attendance').insert({
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // 현재 학습일 시작 시간 이후에 시작된 과목만 조회 (전날 stale 과목 방어)
  const { start } = getStudyDayBounds(getStudyDate());

  const { data } = await supabase
    .from('subjects')
    .select('*')
    .eq('student_id', user.id)
    .eq('is_current', true)
    .gte('started_at', start.toISOString())
    .single();

  return data;
}

// 과목 변경
export async function changeSubject(subjectName: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 입실 상태 확인 - attendance 테이블에서 오늘의 마지막 기록 확인
  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: lastAttendance } = await supabase
    .from('attendance')
    .select('type')
    .eq('student_id', user.id)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  // 마지막 기록이 check_in 또는 break_end여야 입실 상태
  const isCheckedIn = lastAttendance?.type === 'check_in' || lastAttendance?.type === 'break_end';

  if (!isCheckedIn) {
    return { error: '입실 상태에서만 과목을 변경할 수 있습니다.' };
  }

  // 현재 과목 종료 + 새 과목 시작을 동일 timestamp 로 묶어 phantom gap 제거.
  // (이전: old.ended_at = JS now, new.started_at = DB default now() → 매 전환마다 round-trip 만큼 갭)
  const transitionAt = new Date().toISOString();

  await supabase
    .from('subjects')
    .update({ is_current: false, ended_at: transitionAt })
    .eq('student_id', user.id)
    .eq('is_current', true);

  const { error } = await supabase.from('subjects').insert({
    student_id: user.id,
    subject_name: subjectName,
    started_at: transitionAt,
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

// 현재 선택된 과목 리셋 (오입력 취소 — 선택된 카드의 X 배지로 호출)
// 삭제된 row의 정보를 반환하여 클라이언트의 "실행 취소"에 활용
export async function resetCurrentSubject(): Promise<{
  success?: { subjectName: string; startedAt: string };
  error?: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: lastAttendance } = await supabase
    .from('attendance')
    .select('type')
    .eq('student_id', user.id)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  const isCheckedIn = lastAttendance?.type === 'check_in' || lastAttendance?.type === 'break_end';
  if (!isCheckedIn) {
    return { error: '입실 상태에서만 과목을 해제할 수 있습니다.' };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('subjects')
    .delete()
    .eq('student_id', user.id)
    .eq('is_current', true)
    .select('subject_name, started_at')
    .single();

  if (deleteError || !deleted) {
    console.error('Error resetting current subject:', deleteError);
    return { error: '과목 해제에 실패했습니다.' };
  }

  revalidatePath('/student');
  revalidatePath('/student/subject');
  return {
    success: { subjectName: deleted.subject_name, startedAt: deleted.started_at },
  };
}

// 실행 취소: 직전에 reset된 과목을 같은 started_at으로 복원
// 사이에 다른 과목이 선택되었으면 거절
export async function restoreSubject(
  subjectName: string,
  startedAt: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const { data: lastAttendance } = await supabase
    .from('attendance')
    .select('type')
    .eq('student_id', user.id)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  const isCheckedIn = lastAttendance?.type === 'check_in' || lastAttendance?.type === 'break_end';
  if (!isCheckedIn) {
    return { error: '입실 상태에서만 과목을 복원할 수 있습니다.' };
  }

  const { data: existing } = await supabase
    .from('subjects')
    .select('id')
    .eq('student_id', user.id)
    .eq('is_current', true)
    .maybeSingle();

  if (existing) {
    return { error: '이미 다른 과목이 선택되어 복원할 수 없습니다.' };
  }

  const { error } = await supabase.from('subjects').insert({
    student_id: user.id,
    subject_name: subjectName,
    started_at: startedAt,
    is_current: true,
  });

  if (error) {
    console.error('Error restoring subject:', error);
    return { error: '과목 복원에 실패했습니다.' };
  }

  revalidatePath('/student');
  revalidatePath('/student/subject');
  return { success: true };
}

// 오늘(학습일 기준)의 몰입도 조회
export async function getTodayFocus() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

// 상벌점 내역 조회 (단계 7: 분기 필터 + 잔액·redemption 분해)
//
// summary 구조:
//   reward          — 잔액 (음수 행 포함, invariant: ≥ 0) [기존 호환]
//   penalty         — 평생 누적 벌점 [기존 호환]
//   total           — reward - penalty [기존 호환]
//   rewardBalance   — 잔액 (reward 와 동일, 명확화)
//   rewardLifetime  — 양수 reward 합 (총 획득)
//   rewardRedeemed  — 발급 차감 절대값
//   rewardBurnt     — 30점 도달 소멸 절대값 (구 정책)
//   rewardOffset    — 30점 도달 1:1 상계 절대값 (신규 정책)
//   penaltyQuarterRaw  — KST 현재 분기 부여된 벌점 합 (raw)
//   penaltyQuarter     — net (raw − penalty_offset_in_quarter_total). 임계 판정용.
//   penaltyOffsetInQuarter — 분기 내 상계된 벌점 누계
//   penaltyThreshold — 30 (PENALTY_RULES.withdrawAt)
//   quarterStart / quarterEnd — 분기 경계
//   withdrawalReviewAt — 구 정책 검토 진입 여부
//   withdrawalRequiredAt — 신규 정책 강제 퇴원 대상 마크 여부
//   activeRedemptions — requested/auto_pending/issued 상태 redemption (최근 5건)
export async function getPoints(filter?: 'reward' | 'penalty' | 'all') {
  const { getCurrentQuarterStartKST, getNextQuarterStartKST } = await import('@/lib/utils');
  const { PENALTY_RULES } = await import('@/lib/constants');
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const emptySummary = {
    reward: 0,
    penalty: 0,
    total: 0,
    rewardBalance: 0,
    rewardLifetime: 0,
    rewardRedeemed: 0,
    rewardBurnt: 0,
    rewardOffset: 0,
    penaltyQuarterRaw: 0,
    penaltyQuarter: 0,
    penaltyOffsetInQuarter: 0,
    penaltyThreshold: PENALTY_RULES.withdrawAt,
    quarterStart: null as string | null,
    quarterEnd: null as string | null,
    withdrawalReviewAt: null as string | null,
    withdrawalRequiredAt: null as string | null,
    activeRedemptions: [] as Array<{
      id: string;
      status: string;
      voucher_code: string | null;
      voucher_amount: number | null;
      requested_at: string;
      issued_at: string | null;
    }>,
  };
  if (!user) return { points: [], summary: emptySummary };

  let query = supabase
    .from('points')
    .select('*')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });

  if (filter && filter !== 'all') {
    query = query.eq('type', filter);
  }

  const quarterStart = getCurrentQuarterStartKST();
  const quarterEnd = getNextQuarterStartKST();

  const [{ data }, { data: profile }, { data: redemptions }] = await Promise.all([
    query,
    supabase
      .from('student_profiles')
      .select('withdrawal_review_at, withdrawal_required_at, penalty_offset_in_quarter_total')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('reward_redemptions')
      .select('id, status, voucher_code, voucher_amount, requested_at, issued_at')
      .eq('student_id', user.id)
      .in('status', ['requested', 'auto_pending', 'issued'])
      .order('requested_at', { ascending: false })
      .limit(5),
  ]);

  const allPoints = data || [];

  let rewardLifetime = 0;
  let rewardRedeemed = 0;
  let rewardBurnt = 0;
  let rewardOffset = 0;
  let rewardBalance = 0;
  let penaltyLifetime = 0;
  let penaltyQuarterRaw = 0;
  for (const p of allPoints) {
    if (p.type === 'reward') {
      rewardBalance += p.amount;
      if (p.event_kind === 'redeem') rewardRedeemed += -p.amount;
      else if (p.event_kind === 'reset_on_threshold') rewardBurnt += -p.amount;
      else if (p.event_kind === 'offset_against_penalty') rewardOffset += -p.amount;
      else if (p.amount > 0) rewardLifetime += p.amount;
    } else if (p.type === 'penalty') {
      penaltyLifetime += p.amount;
      if (new Date(p.created_at) >= quarterStart) penaltyQuarterRaw += p.amount;
    }
  }

  const penaltyOffsetInQuarter = profile?.penalty_offset_in_quarter_total ?? 0;
  const penaltyQuarter = penaltyQuarterRaw - penaltyOffsetInQuarter;

  return {
    points: allPoints,
    summary: {
      reward: rewardBalance,
      penalty: penaltyLifetime,
      total: rewardBalance - penaltyLifetime,
      rewardBalance,
      rewardLifetime,
      rewardRedeemed,
      rewardBurnt,
      rewardOffset,
      penaltyQuarterRaw,
      penaltyQuarter,
      penaltyOffsetInQuarter,
      penaltyThreshold: PENALTY_RULES.withdrawAt,
      quarterStart: quarterStart.toISOString(),
      quarterEnd: quarterEnd.toISOString(),
      withdrawalReviewAt: profile?.withdrawal_review_at ?? null,
      withdrawalRequiredAt: profile?.withdrawal_required_at ?? null,
      activeRedemptions: redemptions ?? [],
    },
  };
}

/** 단계 12: 본인 정책 동의 여부 확인 (v1 기준). 학생/학부모 공용. */
export async function checkPolicyAcknowledgement(): Promise<{
  acknowledged: boolean;
  version: string;
}> {
  const { POLICY_VERSION } = await import('@/lib/constants');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { acknowledged: true, version: POLICY_VERSION };

  const { data } = await supabase
    .from('policy_acknowledgements')
    .select('id')
    .eq('user_id', user.id)
    .eq('policy_version', POLICY_VERSION)
    .maybeSingle();

  return { acknowledged: !!data, version: POLICY_VERSION };
}

/** 단계 12: 정책 동의 INSERT. RLS WITH CHECK (user_id = auth.uid()) 로 본인만 허용. */
export async function acknowledgePolicy(): Promise<{ success: true } | { error: string }> {
  const { POLICY_VERSION } = await import('@/lib/constants');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('policy_acknowledgements')
    .insert({ user_id: user.id, policy_version: POLICY_VERSION });
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      // 이미 동의함 — silent success
      return { success: true };
    }
    console.error('acknowledgePolicy error:', error);
    return { error: '정책 동의 처리에 실패했습니다.' };
  }
  return { success: true };
}

/** 단계 9: 오늘 자동 상점 진행도 (학습일 종료 전 실시간 계산) */
export async function getTodayFocusProgress() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const studyDate = getStudyDate();
  const { start, end } = getStudyDayBounds(studyDate);

  const [{ data: attendance }, { data: subjects }] = await Promise.all([
    supabase
      .from('attendance')
      .select('type, timestamp, source, gate_name')
      .eq('student_id', user.id)
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .order('timestamp', { ascending: true })
      .limit(2000),
    supabase
      .from('subjects')
      .select('started_at, ended_at')
      .eq('student_id', user.id)
      .gte('started_at', start.toISOString())
      .lte('started_at', end.toISOString())
      .limit(500),
  ]);

  const metrics = calculateUnclassifiedMetrics(attendance ?? [], subjects ?? [], end, {
    minSegmentSeconds: REWARD_RULES.dailyFocusMinSegmentSeconds,
    clampToNow: true,
  });

  // dayStart KST 요일 (월~금 = 평일)
  const dayStartKst = new Date(start.getTime() + 9 * 60 * 60 * 1000);
  const dow = dayStartKst.getUTCDay();
  const isWeekday = (REWARD_RULES.dailyFocusWeekdays as readonly number[]).includes(dow);

  return {
    studyMinutes: metrics.studyMinutes,
    unclassifiedMinutes: metrics.unclassifiedMinutes,
    targetMinutes: REWARD_RULES.dailyFocusHours * 60,
    graceMinutes: REWARD_RULES.dailyFocusUnclassifiedGraceMinutes,
    isWeekday,
  };
}

/** 단계 9: 최근 N일 자동 상점 평가 이력 */
export async function getRecentDailyFocusEvaluations(days: number = 7) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 어제부터 N-1일 전까지
  const today = new Date();
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - days);

  const { data } = await supabase
    .from('daily_focus_evaluations')
    .select('study_date, study_minutes, unclassified_minutes, is_weekday, granted, granted_reason')
    .eq('student_id', user.id)
    .gte('study_date', startDate.toISOString().split('T')[0])
    .order('study_date', { ascending: false })
    .limit(days);
  return data ?? [];
}

/** 학생 본인 상품권 신청 — RPC request_redemption 호출. 단계 10. */
export async function requestRedemption(): Promise<
  { success: true; redemptionId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data, error } = await supabase.rpc('request_redemption', {
    p_student_id: user.id,
  });
  if (error) {
    console.error('request_redemption error:', error);
    return { error: '상품권 신청에 실패했습니다.' };
  }

  const result = data as
    | { status: 'requested'; redemption_id: string }
    | { status: 'rejected_insufficient'; balance: number; queue: number; available: number }
    | { status: 'rejected_in_review' };

  if (result.status === 'rejected_in_review') {
    return { error: '퇴원 검토 중에는 신청할 수 없습니다.' };
  }
  if (result.status === 'rejected_insufficient') {
    return {
      error: `사용 가능 상점이 부족합니다. (잔액 ${result.balance}, 대기 ${result.queue}건)`,
    };
  }

  // 관리자 사내 알림은 단계 10 (notification.ts) 에서 보강 예정
  revalidatePath('/student/points');
  return { success: true, redemptionId: result.redemption_id };
}

/** 학생 본인 지점의 상·벌점 프리셋(규정) 조회 — 학생 상벌점 화면 하단 표시용 */
export async function getPointPresets(): Promise<{
  rewardPresets: RewardPreset[];
  penaltyPresets: PenaltyPreset[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { rewardPresets: [], penaltyPresets: [] };
  }

  const branchId = await getStudentBranchId(user.id);
  if (!branchId) {
    return { rewardPresets: [], penaltyPresets: [] };
  }

  const [rewardPresets, penaltyPresets] = await Promise.all([
    getRewardPresets(branchId),
    getPenaltyPresets(branchId),
  ]);

  // 자동 부과가 꺼진(auto_enabled=false) 시스템 프리셋(지각/조기퇴실)은 학생/학부모 규정 표에서 숨긴다.
  // (관리자 수동 부과 목록·규정 관리에는 계속 노출 — getPenaltyPresets 는 그대로 사용)
  const visiblePenaltyPresets = penaltyPresets.filter(
    (p) => !p.is_system || p.auto_enabled === true,
  );

  return { rewardPresets, penaltyPresets: visiblePenaltyPresets };
}

// 오늘(학습일 기준)의 과목 기록 조회
export async function getTodaySubjects() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
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

  // 정본 세션 합산 사용 (크론 정산·관리자 주간현황과 동일한 계산). 미닫힘 세션은
  // weekEnd(다음 월 06:00, 미래)로 cap → 사실상 현재 시각까지 집계된다.
  return Math.floor(sumStudySeconds(attendance, weekEnd) / 60);
}

// 주간 목표 달성도 조회 (날짜 타입별 가중 평균 적용)
export async function getWeeklyProgress(studentId?: string): Promise<{
  goalHours: number;
  actualMinutes: number;
  progressPercent: number;
  studentTypeName: string | null;
}> {
  const supabase = await createClient();

  let targetStudentId = studentId;

  if (!targetStudentId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { goalHours: 0, actualMinutes: 0, progressPercent: 0, studentTypeName: null };
    targetStudentId = user.id;
  }

  // 학생의 타입 정보와 지점 정보 조회
  const { data: studentProfile } = await supabase
    .from('student_profiles')
    .select(
      `
      student_type_id,
      student_types (
        name,
        weekly_goal_hours
      )
    `,
    )
    .eq('id', targetStudentId)
    .single();

  let goalHours = 0;
  let studentTypeName: string | null = null;
  let studentTypeId: string | null = null;
  let defaultGoalHours = 0;

  if (studentProfile?.student_types) {
    const studentType = studentProfile.student_types as unknown as {
      name: string;
      weekly_goal_hours: number;
    };
    defaultGoalHours = studentType.weekly_goal_hours;
    studentTypeName = studentType.name;
    studentTypeId = studentProfile.student_type_id;
  }

  // 학생의 지점 ID 조회
  const branchId = await getStudentBranchId(targetStudentId);

  // 날짜 타입별 목표시간 계산
  if (studentTypeId && branchId) {
    goalHours = await calculateWeeklyGoalHours(studentTypeId, branchId, defaultGoalHours);
  } else {
    goalHours = defaultGoalHours;
  }

  // 주간 학습 시간 조회
  const actualMinutes = await getWeeklyStudyTime(targetStudentId);

  // 달성률 계산
  const goalMinutes = goalHours * 60;
  const progressPercent =
    goalMinutes > 0 ? Math.min(100, Math.round((actualMinutes / goalMinutes) * 100)) : 0;

  return {
    goalHours,
    actualMinutes,
    progressPercent,
    studentTypeName,
  };
}

// 날짜 타입별 가중 평균 주간 목표시간 계산
async function calculateWeeklyGoalHours(
  studentTypeId: string,
  branchId: string,
  defaultGoalHours: number,
): Promise<number> {
  const supabase = await createClient();

  // 이번 학습주(월~일)의 날짜 문자열을 KST 기준으로 생성
  const weekStart = getWeekStart(new Date());
  const weekDates = getWeekDateStringsFromMondayKST(formatDateKST(weekStart));

  // 해당 주의 날짜별 date_type 조회
  const { data: dateAssignments } = await supabase
    .from('date_assignments')
    .select('date, date_type_id')
    .eq('branch_id', branchId)
    .in('date', weekDates);

  // 날짜별 date_type_id 맵 생성
  const dateTypeMap = new Map<string, string>();
  dateAssignments?.forEach((da) => {
    dateTypeMap.set(da.date, da.date_type_id);
  });

  // 학생 타입의 날짜 타입별 목표 설정 조회
  const { data: goalSettings } = await supabase
    .from('weekly_goal_settings')
    .select('date_type_id, weekly_goal_hours')
    .eq('student_type_id', studentTypeId);

  // 날짜 타입별 목표시간 맵 생성
  const goalMap = new Map<string, number>();
  goalSettings?.forEach((gs) => {
    goalMap.set(gs.date_type_id, gs.weekly_goal_hours);
  });

  // 날짜 타입별 일수 카운트 및 목표시간 합산
  let totalGoalHours = 0;
  let assignedDays = 0;

  for (const date of weekDates) {
    const dateTypeId = dateTypeMap.get(date);
    if (dateTypeId && goalMap.has(dateTypeId)) {
      // 해당 날짜 타입의 목표시간을 7로 나눈 값 (일일 목표)
      totalGoalHours += goalMap.get(dateTypeId)! / 7;
      assignedDays++;
    }
  }

  // 모든 날짜에 설정이 있으면 계산된 값 사용, 아니면 기본값으로 채움
  if (assignedDays === 7) {
    return Math.round(totalGoalHours);
  } else if (assignedDays > 0) {
    // 일부만 설정된 경우: 설정된 날은 설정값, 나머지는 기본값의 일일 비율로 계산
    const unassignedDays = 7 - assignedDays;
    const dailyDefault = defaultGoalHours / 7;
    return Math.round(totalGoalHours + dailyDefault * unassignedDays);
  } else {
    // 설정이 없으면 기본값 사용
    return defaultGoalHours;
  }
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

// 월의 시작 학습일(1일) 반환 — UTC 자정 기준
function getMonthStart(date: Date = new Date()): Date {
  const studyDate = getStudyDate(date);
  return new Date(Date.UTC(studyDate.getUTCFullYear(), studyDate.getUTCMonth(), 1));
}

// 기간별 날짜 범위 계산
function getPeriodBounds(
  period: StudyPeriod,
  baseDate: Date = new Date(),
): { start: Date; end: Date } {
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
      // 이번 달 1일 학습일 ~ 다음 달 1일 학습일(미포함)을 학습일 경계(06:00 KST)로 정렬
      const firstOfMonth = getMonthStart(baseDate);
      const firstOfNextMonth = new Date(
        Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 1),
      );
      return {
        start: getStudyDayBounds(firstOfMonth).start,
        end: getStudyDayBounds(firstOfNextMonth).start,
      };
    }
  }
}

// 기간별 학습 통계 조회
export async function getStudyStatsByPeriod(
  period: StudyPeriod,
  baseDate?: Date,
): Promise<{
  totalSeconds: number;
  sessions: StudySession[];
  periodStart: string;
  periodEnd: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  baseDate?: Date,
): Promise<{
  subjectTimes: Record<string, number>;
  subjectRecords: SubjectStudyRecord[];
  unclassifiedSeconds: number;
  unclassifiedSegments: UnclassifiedSegment[];
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      subjectTimes: {},
      subjectRecords: [],
      unclassifiedSeconds: 0,
      unclassifiedSegments: [],
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

  // 과목별 시간 계산 (학습 세션과 교차하는 시간만)
  // — 미분류 metrics 는 공통 헬퍼로 일원화 (cron/widget 과 동일한 자투리 필터 적용).
  const studySessions = extractStudySessions(attendance || [], end);
  const subjectTimes: Record<string, number> = {};
  const subjectRecords: SubjectStudyRecord[] = [];

  for (const subject of subjects || []) {
    const subjectStart = new Date(subject.started_at);
    const subjectEnd = subject.ended_at
      ? new Date(subject.ended_at)
      : subject.is_current
        ? new Date()
        : subjectStart;

    // 학습 세션과 교차하는 시간만 계산 (퇴실 이후 시간 제외)
    let effectiveSeconds = 0;
    for (const session of studySessions) {
      const overlapStart = Math.max(subjectStart.getTime(), session.startTime.getTime());
      const overlapEnd = Math.min(subjectEnd.getTime(), session.endTime.getTime());
      if (overlapEnd > overlapStart) {
        effectiveSeconds += Math.floor((overlapEnd - overlapStart) / 1000);
      }
    }

    subjectTimes[subject.subject_name] =
      (subjectTimes[subject.subject_name] || 0) + effectiveSeconds;
    subjectRecords.push({
      subjectName: subject.subject_name,
      startTime: subjectStart,
      endTime: subjectEnd,
      durationSeconds: effectiveSeconds,
    });
  }

  // 미분류는 빼기 방식 폐기 — 헬퍼가 segments 합산으로 산출.
  // 자투리 필터 동일 → 화면 표시값과 cron gate 값이 항상 일치.
  const metrics = calculateUnclassifiedMetrics(attendance || [], subjects || [], end, {
    minSegmentSeconds: REWARD_RULES.dailyFocusMinSegmentSeconds,
    clampToNow: true,
  });

  return {
    subjectTimes,
    subjectRecords,
    unclassifiedSeconds: metrics.unclassifiedSeconds,
    unclassifiedSegments: metrics.segments,
  };
}

// 일별 학습 시간 추이 (주간/월간 용)
export async function getDailyStudyTrend(
  period: 'weekly' | 'monthly',
  baseDate?: Date,
): Promise<Array<{ date: string; totalSeconds: number; subjectTimes: Record<string, number> }>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const dailyData: Map<
    string,
    {
      attendance: typeof attendance;
      subjects: typeof subjects;
    }
  > = new Map();

  // 기간 내 모든 날짜 초기화 (분류와 동일하게 학습일 기준 키 사용)
  const current = new Date(start);
  while (current < end) {
    const dateStr = getStudyDate(current).toISOString().split('T')[0];
    dailyData.set(dateStr, { attendance: [], subjects: [] });
    current.setUTCDate(current.getUTCDate() + 1);
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
  const result: Array<{
    date: string;
    totalSeconds: number;
    subjectTimes: Record<string, number>;
  }> = [];

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
      subjectTimes[subject.subject_name] =
        (subjectTimes[subject.subject_name] || 0) + durationSeconds;
    }

    result.push({ date: dateStr, totalSeconds, subjectTimes });
  }

  const sorted = result.sort((a, b) => a.date.localeCompare(b.date));

  // 월간은 일별 데이터를 주(週) 단위로 묶어 반환 (각 주의 월요일 학습일을 키로 사용)
  if (period === 'monthly') {
    const weekMap = new Map<
      string,
      { totalSeconds: number; subjectTimes: Record<string, number> }
    >();
    for (const day of sorted) {
      // getWeekStart는 월요일 06:00 KST(=일요일 21:00 UTC)를 반환하므로, getStudyDate로 다시 월요일 학습일로 변환
      const mondayKey = getStudyDate(getWeekStart(new Date(`${day.date}T00:00:00.000Z`)))
        .toISOString()
        .split('T')[0];
      const bucket = weekMap.get(mondayKey) || { totalSeconds: 0, subjectTimes: {} };
      bucket.totalSeconds += day.totalSeconds;
      for (const [name, sec] of Object.entries(day.subjectTimes)) {
        bucket.subjectTimes[name] = (bucket.subjectTimes[name] || 0) + sec;
      }
      weekMap.set(mondayKey, bucket);
    }
    return Array.from(weekMap.entries())
      .map(([date, b]) => ({ date, totalSeconds: b.totalSeconds, subjectTimes: b.subjectTimes }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return sorted;
}

// 이전 기간 대비 비교
export async function getStudyComparison(
  period: StudyPeriod,
  baseDate?: Date,
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

  const changePercent =
    previousStats.totalSeconds > 0
      ? Math.round(
          ((currentStats.totalSeconds - previousStats.totalSeconds) / previousStats.totalSeconds) *
            100,
        )
      : currentStats.totalSeconds > 0
        ? 100
        : 0;

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
  subjectName: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (end <= start) {
    return { error: '종료 시간이 시작 시간보다 커야 합니다.' };
  }

  // 최소 길이 가드 — 모달은 1분 미만 segment 를 노출하지 않지만 API 직접 호출은 우회 가능.
  // 헬퍼의 자투리 필터와 동일 임계값을 적용해 운영 일관성 확보.
  const durationSec = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (durationSec < REWARD_RULES.dailyFocusMinSegmentSeconds) {
    return { error: '1분 미만은 할당할 수 없습니다.' };
  }

  // 해당 학습일의 범위 계산
  const studyDate = getStudyDate(start);
  const { start: dayStart, end: dayEnd } = getStudyDayBounds(studyDate);

  // 해당 학습일에 시작된 과목만 겹침 체크
  // (다른 날짜에 시작된 과목은 미분류 계산에 영향을 주지 않음)
  const { data: existingSubjects } = await supabase
    .from('subjects')
    .select('*')
    .eq('student_id', user.id)
    .gte('started_at', dayStart.toISOString())
    .lt('started_at', dayEnd.toISOString());

  // 겹치는 구간이 있으면 에러
  for (const existing of existingSubjects || []) {
    // 현재 진행 중인 과목은 겹침 체크에서 제외
    if (existing.is_current && !existing.ended_at) {
      continue;
    }

    const existingStart = new Date(existing.started_at);
    const existingEnd = existing.ended_at ? new Date(existing.ended_at) : existingStart;

    // 할당하려는 시간과 겹치는지 확인
    if (existingStart < end && existingEnd > start) {
      return { error: '이미 과목이 할당된 시간대와 겹칩니다.' };
    }
  }

  // 새 과목 기록 삽입
  const { error } = await supabase.from('subjects').insert({
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
  branchId: string | null;
  branchName: string | null;
  studentTypeId: string | null;
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // profiles 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      `
      id,
      email,
      name,
      phone,
      branch_id,
      branches (
        name
      )
    `,
    )
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  // student_profiles 조회
  const { data: studentProfile } = await supabase
    .from('student_profiles')
    .select(
      `
      seat_number,
      parent_code,
      birthday,
      student_type_id,
      student_types (
        name
      )
    `,
    )
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
    branchId: profile.branch_id,
    branchName: branch?.name || null,
    studentTypeId: studentProfile.student_type_id,
    studentTypeName: studentType?.name || null,
  };
}

// 학생 프로필 정보 수정 (이름, 전화번호, 학생 유형)
export async function updateStudentProfile(data: {
  name?: string;
  phone?: string;
  studentTypeId?: string | null;
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const profileUpdateData: { name?: string; phone?: string | null } = {};

  if (data.name !== undefined) {
    if (!data.name.trim()) {
      return { error: '이름을 입력해주세요.' };
    }
    profileUpdateData.name = data.name.trim();
  }

  if (data.phone !== undefined) {
    profileUpdateData.phone = data.phone.trim() || null;
  }

  // profiles 테이블 업데이트 (이름, 전화번호)
  if (Object.keys(profileUpdateData).length > 0) {
    const { error } = await supabase.from('profiles').update(profileUpdateData).eq('id', user.id);

    if (error) {
      console.error('Error updating profile:', error);
      return { error: '프로필 수정에 실패했습니다.' };
    }
  }

  // student_profiles 테이블 업데이트 (학생 유형)
  if (data.studentTypeId !== undefined) {
    const { error } = await supabase
      .from('student_profiles')
      .update({ student_type_id: data.studentTypeId || null })
      .eq('id', user.id);

    if (error) {
      console.error('Error updating student type:', error);
      return { error: '학생 유형 수정에 실패했습니다.' };
    }
  }

  revalidatePath('/student/settings');
  return { success: true };
}

// 연결된 학부모 목록 조회
export async function getLinkedParents(): Promise<LinkedParent[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // parent_student_links에서 연결된 학부모 ID 목록 조회
  const { data: links } = await supabase
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', user.id);

  if (!links || links.length === 0) return [];

  const parentIds = links.map((link) => link.parent_id);

  // 학부모 정보 조회
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email, phone')
    .in('id', parentIds);

  if (!profiles) return [];

  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
  }));
}

// 비밀번호 변경
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: '로그인이 필요합니다.' };

  if (!currentPassword || !newPassword) {
    return { error: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' };
  }

  if (newPassword.length < 6) {
    return { error: '새 비밀번호는 6자 이상이어야 합니다.' };
  }

  if (currentPassword === newPassword) {
    return { error: '새 비밀번호가 현재 비밀번호와 같습니다.' };
  }

  // 현재 비밀번호 확인 — 본 세션을 건드리지 않도록 격리 클라이언트로 검증
  if (!(await verifyCurrentPassword(user.email, currentPassword))) {
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

// 학생 본인 회원 탈퇴 (Apple App Store 5.1.1(v) 대응)
//
// - 현재 비밀번호 재인증 후 soft delete 처리
// - 어드민 deleteMember 와 동일한 보존 정책 (모의고사·결제·CAPS 이력 유지)
// - 미승인 학생(is_approved=false) 도 동일하게 탈퇴 가능
export async function withdrawSelf(
  currentPassword: string,
  reason?: string,
): Promise<{ success?: boolean; warning?: string; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: '로그인이 필요합니다.' };

  if (!currentPassword) {
    return { error: '현재 비밀번호를 입력해주세요.' };
  }

  // 현재 비밀번호 확인 — 본 세션을 건드리지 않도록 격리 클라이언트로 검증
  if (!(await verifyCurrentPassword(user.email, currentPassword))) {
    return { error: '현재 비밀번호가 올바르지 않습니다.' };
  }

  const result = await softDeleteUser({
    userId: user.id,
    withdrawnBy: user.id,
    reason: reason?.trim() || null,
  });

  if ('error' in result) {
    return { error: result.error };
  }

  revalidatePath('/student');
  revalidatePath('/student/settings');

  if (result.warning) {
    return { success: true, warning: result.warning };
  }
  return { success: true };
}
