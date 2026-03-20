import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DAY_CONFIG } from '@/lib/constants';
import { formatDate, getStudyDate } from '@/lib/utils';

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
      const checkOutRecords = studentsToCheckOut.map(studentId => ({
        student_id: studentId,
        type: 'check_out',
        timestamp: resetAt,
        source: 'auto_reset',
      }));

      const { error: checkOutError } = await supabase
        .from('attendance')
        .insert(checkOutRecords);

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

    return NextResponse.json({
      success: true,
      message: `Auto checkout ${checkOutCount} student(s), reset ${count} active subject(s), cleared ${phoneSubmissionResetCount} phone submission row(s) for ${phoneSubmissionStudyDate}`,
      checkOutCount,
      resetCount: count,
      phoneSubmissionResetCount,
      phoneSubmissionStudyDate,
      resetAt,
      resetUTC,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Daily subject reset cron error:', errorMessage);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
