import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DAY_CONFIG, REWARD_RULES } from '@/lib/constants';
import { formatDate, getStudyDate, getStudyDayBounds } from '@/lib/utils';
import { notifyPointsGranted } from '@/lib/actions/notification';

// Supabase 서비스 롤 클라이언트 (RLS 우회)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// DAY_CONFIG 기준 익일 리셋 시각을 UTC ISO 문자열로 반환
// endHour: 27 = 다음날 03:00 KST = 당일 18:00 UTC
function getResetTimeUTC(): { hour: number; minute: number } {
  const kstEndHour = DAY_CONFIG.endHour; // 27 (다음날 03시)
  const kstEndMinute = DAY_CONFIG.endMinute; // 0
  // KST = UTC+9, endHour이 24 이상이면 다음날로 넘어간 것
  const totalKstMinutes = kstEndHour * 60 + kstEndMinute;
  const totalUtcMinutes = totalKstMinutes - 9 * 60;
  const normalizedUtcMinutes = ((totalUtcMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return {
    hour: Math.floor(normalizedUtcMinutes / 60),
    minute: normalizedUtcMinutes % 60,
  };
}

// 단계 9: 미분류 시간 알고리즘 (의사코드 → 구현)
// 입력: 학습일 attendance 정렬 + subjects (started_at, ended_at)
// 반환: { studyMinutes, unclassifiedMinutes }
//   입실_구간: check_in/break_end → check_out/break_start 페어
//   미분류 = 입실 구간 − (입실 구간 ∩ subjects 구간)
function calculateUnclassifiedMinutes(
  attendance: Array<{ type: string; timestamp: string }>,
  subjects: Array<{ started_at: string; ended_at: string | null }>,
  studyDayEnd: Date,
): { studyMinutes: number; unclassifiedMinutes: number } {
  const inSessions: Array<[number, number]> = [];
  let inStart: number | null = null;
  for (const a of attendance) {
    const t = new Date(a.timestamp).getTime();
    if (a.type === 'check_in' || a.type === 'break_end') {
      if (inStart === null) inStart = t;
    } else if (a.type === 'check_out' || a.type === 'break_start') {
      if (inStart !== null) {
        inSessions.push([inStart, t]);
        inStart = null;
      }
    }
  }
  if (inStart !== null) inSessions.push([inStart, studyDayEnd.getTime()]);

  const subSessions: Array<[number, number]> = subjects.map((s) => [
    new Date(s.started_at).getTime(),
    s.ended_at ? new Date(s.ended_at).getTime() : studyDayEnd.getTime(),
  ]);

  let classifiedMs = 0;
  for (const [iStart, iEnd] of inSessions) {
    for (const [sStart, sEnd] of subSessions) {
      const overlapStart = Math.max(iStart, sStart);
      const overlapEnd = Math.min(iEnd, sEnd);
      if (overlapEnd > overlapStart) classifiedMs += overlapEnd - overlapStart;
    }
  }

  const studyMs = inSessions.reduce((s, [a, b]) => s + (b - a), 0);
  return {
    studyMinutes: Math.floor(studyMs / 60000),
    unclassifiedMinutes: Math.max(0, Math.floor((studyMs - classifiedMs) / 60000)),
  };
}

// 단계 9: 자동 일일 상점 평가 (전 학생 순회)
async function evaluateDailyFocus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  studyDateStr: string,
): Promise<{ evaluated: number; granted: number; errors: number }> {
  // 학습일 경계 (KST)
  const { start: dayStart, end: dayEnd } = getStudyDayBounds(studyDateStr);

  // 요일 캡: 학습일 시작 기준 KST 요일 (월=1, 일=0)
  // dayStart 는 학습일 06:00 KST = 다음날 21:00 UTC. KST 요일은 dayStart KST date 기준.
  const dayStartKst = new Date(dayStart.getTime() + 9 * 60 * 60 * 1000);
  const dow = dayStartKst.getUTCDay(); // 0=일, 1=월, ..., 6=토
  const isWeekday = (REWARD_RULES.dailyFocusWeekdays as readonly number[]).includes(dow);

  // 활성 학생 조회 + branch_id (preset 매칭용)
  const { data: students, error: studentsErr } = await supabase
    .from('student_profiles')
    .select(
      `
      id,
      profiles!inner (name, branch_id, withdrawn_at, is_approved)
    `,
    )
    .is('profiles.withdrawn_at', null)
    .eq('profiles.is_approved', true);
  if (studentsErr || !students) {
    console.error('daily-focus evaluateDailyFocus: fetch students failed', studentsErr);
    return { evaluated: 0, granted: 0, errors: 1 };
  }

  // branch 별 daily_focus preset id 매핑
  const { data: presets } = await supabase
    .from('reward_presets')
    .select('id, branch_id')
    .eq('code', 'daily_focus');
  const presetByBranch = new Map<string, string>(
    (presets ?? []).map((p) => [p.branch_id as string, p.id as string]),
  );

  let evaluated = 0;
  let granted = 0;
  let errors = 0;

  for (const s of students) {
    try {
      const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      const branchId = (profile as { branch_id?: string })?.branch_id;
      const studentName = (profile as { name?: string | null })?.name ?? undefined;
      const presetId = branchId ? presetByBranch.get(branchId) : null;

      const [{ data: attendance }, { data: subjects }] = await Promise.all([
        supabase
          .from('attendance')
          .select('type, timestamp')
          .eq('student_id', s.id)
          .gte('timestamp', dayStart.toISOString())
          .lte('timestamp', dayEnd.toISOString())
          .order('timestamp', { ascending: true })
          .limit(2000),
        supabase
          .from('subjects')
          .select('started_at, ended_at')
          .eq('student_id', s.id)
          .gte('started_at', dayStart.toISOString())
          .lte('started_at', dayEnd.toISOString())
          .limit(500),
      ]);

      const { studyMinutes, unclassifiedMinutes } = calculateUnclassifiedMinutes(
        attendance ?? [],
        subjects ?? [],
        dayEnd,
      );

      let didGrant = false;
      let reason: string | null = null;
      if (!isWeekday) {
        reason = '주말 캡 (월~금만 부여)';
      } else if (studyMinutes < REWARD_RULES.dailyFocusHours * 60) {
        reason = `학습시간 부족 (${studyMinutes}분 / ${REWARD_RULES.dailyFocusHours * 60}분)`;
      } else if (unclassifiedMinutes > REWARD_RULES.dailyFocusUnclassifiedGraceMinutes) {
        reason = `미분류 시간 초과 (${unclassifiedMinutes}분 / ${REWARD_RULES.dailyFocusUnclassifiedGraceMinutes}분)`;
      } else {
        didGrant = true;
      }

      // daily_focus_evaluations UPSERT (멱등)
      await supabase.from('daily_focus_evaluations').upsert(
        {
          student_id: s.id,
          study_date: studyDateStr,
          study_minutes: studyMinutes,
          unclassified_minutes: unclassifiedMinutes,
          is_weekday: isWeekday,
          granted: didGrant,
          granted_reason: reason,
        },
        { onConflict: 'student_id,study_date' },
      );

      if (didGrant && presetId) {
        // points INSERT — uq_points_daily_preset 인덱스가 중복 차단
        const { data: point, error: pointErr } = await supabase
          .from('points')
          .insert({
            student_id: s.id,
            admin_id: null,
            type: 'reward',
            amount: REWARD_RULES.dailyFocusAmount,
            reason: '일일 학습 3시간 + 과목 분류',
            is_auto: true,
            event_kind: 'auto_daily_focus',
            preset_id: presetId,
            preset_type: 'reward',
          })
          .select('id')
          .maybeSingle();

        if (pointErr && (pointErr as { code?: string }).code !== '23505') {
          console.error('daily-focus point insert error:', pointErr);
          errors++;
        } else if (point) {
          granted++;
          // evaluations 에 point_id 연결
          await supabase
            .from('daily_focus_evaluations')
            .update({ point_id: point.id })
            .eq('student_id', s.id)
            .eq('study_date', studyDateStr);

          // 학생 + 모든 학부모 앱 알림 + 푸시 (fire-and-forget)
          notifyPointsGranted({
            studentId: s.id,
            type: 'reward',
            amount: REWARD_RULES.dailyFocusAmount,
            reason: '일일 학습 3시간 + 과목 분류',
            studentName,
          }).catch((e) => console.error('[daily-focus] notifyPointsGranted', e));
        }
      }
      evaluated++;
    } catch (e) {
      console.error('daily-focus eval error for student', s.id, e);
      errors++;
    }
  }

  return { evaluated, granted, errors };
}

export async function GET(request: Request) {
  // Cron secret 검증
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const resetUTC = getResetTimeUTC();
  const resetAt = new Date().toISOString();

  try {
    // -------------------------------------------------------
    // 1. 현재 입실/외출 중인 학생 강제 퇴실 처리
    // -------------------------------------------------------
    // 오늘 학습일 범위 내에서 마지막 기록이 check_in 또는 break_start인 학생을 찾아
    // check_out 레코드를 삽입한다. (타임스탬프는 리셋 시각)

    // 오늘 날짜 기준 학습일 시작 시각 계산 (KST 기준 당일 06:00 = UTC 전날 21:00)
    const nowUtc = new Date();
    // 리셋은 KST 03:00(익일)에 실행되므로 KST 날짜는 이미 다음날 → 학습일은 전날
    // 학습일 시작: UTC 기준 어제의 21:00
    const dayStart = new Date(nowUtc);
    dayStart.setUTCHours(resetUTC.hour, resetUTC.minute, 0, 0); // 현재 날짜의 18:00 UTC
    // 학습일 시작은 전날 21:00 UTC
    const studyDayStart = new Date(dayStart);
    studyDayStart.setUTCDate(studyDayStart.getUTCDate() - 1);
    studyDayStart.setUTCHours(24 + (DAY_CONFIG.startHour - 9), DAY_CONFIG.startMinute, 0, 0); // 06:00 KST = 21:00 UTC 전날

    // 해당 학습일 내 모든 출석 기록 조회
    const { data: attendanceRecords, error: attendanceFetchError } = await supabase
      .from('attendance')
      .select('student_id, type, timestamp')
      .gte('timestamp', studyDayStart.toISOString())
      .lte('timestamp', resetAt)
      .order('timestamp', { ascending: true });

    if (attendanceFetchError) {
      throw new Error(`Failed to fetch attendance: ${attendanceFetchError.message}`);
    }

    // 학생별 마지막 기록을 추려서 입실/외출 중인 학생 목록 추출
    const lastRecordByStudent = new Map<string, string>();
    for (const record of attendanceRecords ?? []) {
      lastRecordByStudent.set(record.student_id, record.type);
    }

    const studentsToCheckOut: string[] = [];
    for (const [studentId, lastType] of lastRecordByStudent.entries()) {
      if (lastType === 'check_in' || lastType === 'break_start' || lastType === 'break_end') {
        studentsToCheckOut.push(studentId);
      }
    }

    let checkOutCount = 0;
    if (studentsToCheckOut.length > 0) {
      const checkOutRecords = studentsToCheckOut.map((studentId) => ({
        student_id: studentId,
        type: 'check_out',
        timestamp: resetAt,
        source: 'auto_reset',
      }));

      const { error: checkOutError } = await supabase.from('attendance').insert(checkOutRecords);

      if (checkOutError) {
        throw new Error(`Failed to auto checkout students: ${checkOutError.message}`);
      }

      checkOutCount = studentsToCheckOut.length;
    }

    // -------------------------------------------------------
    // 2. 기존: is_current = true 과목 리셋
    // -------------------------------------------------------
    const { data: currentSubjects, error: fetchError } = await supabase
      .from('subjects')
      .select('id, student_id')
      .eq('is_current', true);

    if (fetchError) {
      throw new Error(`Failed to fetch current subjects: ${fetchError.message}`);
    }

    const count = currentSubjects?.length ?? 0;

    if (count > 0) {
      const { error: updateError } = await supabase
        .from('subjects')
        .update({
          is_current: false,
          ended_at: resetAt,
        })
        .eq('is_current', true)
        .is('ended_at', null);

      if (updateError) {
        throw new Error(`Failed to reset subjects: ${updateError.message}`);
      }

      // ended_at이 이미 있는데 is_current만 true인 경우도 처리 (안전장치)
      const { error: updateError2 } = await supabase
        .from('subjects')
        .update({ is_current: false })
        .eq('is_current', true);

      if (updateError2) {
        throw new Error(`Failed to reset remaining subjects: ${updateError2.message}`);
      }
    }

    // -------------------------------------------------------
    // 3. 휴대폰 제출 여부: 지문/일일 리셋 시각과 동일하게 해당 학습일 데이터 삭제
    //    (KST 03:00 전후 getStudyDate()는 막 끝난 학습일 YYYY-MM-DD와 일치)
    // -------------------------------------------------------
    const phoneSubmissionStudyDate = formatDate(getStudyDate(new Date()));
    const { data: deletedPhones, error: phoneDeleteError } = await supabase
      .from('phone_submissions')
      .delete()
      .eq('date', phoneSubmissionStudyDate)
      .select('student_id');

    if (phoneDeleteError) {
      throw new Error(`Failed to reset phone submissions: ${phoneDeleteError.message}`);
    }

    const phoneSubmissionResetCount = deletedPhones?.length ?? 0;

    // -------------------------------------------------------
    // 4. 자동 일일 상점 평가 (단계 9)
    //    - 학습일(어제) 종료 시점 기준
    //    - 순공시간 ≥ 3시간 + 미분류 ≤ 5분 + 주 5일 캡(월~금)
    //    - 결과는 daily_focus_evaluations 에 UPSERT (사후 분석용)
    //    - 부여 시 points INSERT (event_kind='auto_daily_focus', preset='daily_focus')
    // -------------------------------------------------------
    const focusResult = await evaluateDailyFocus(supabase, phoneSubmissionStudyDate);

    return NextResponse.json({
      success: true,
      message: `Auto checkout ${checkOutCount} student(s), reset ${count} active subject(s), cleared ${phoneSubmissionResetCount} phone submission row(s) for ${phoneSubmissionStudyDate}. Daily focus: ${focusResult.granted} granted, ${focusResult.evaluated} evaluated.`,
      checkOutCount,
      resetCount: count,
      phoneSubmissionResetCount,
      phoneSubmissionStudyDate,
      dailyFocus: focusResult,
      resetAt,
      resetUTC,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Daily subject reset cron error:', errorMessage);

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
