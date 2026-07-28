import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStudyDate, getStudyDayBounds } from '@/lib/utils';
import { fetchMandatoryTime } from '@/lib/attendance/penalty';
import { createBulkStudentNotifications } from '@/lib/actions/notification';

// 영단어 시험 미응시 리마인더 크론 (KST 20:00 = UTC 11:00, "0 11 * * *")
//
// 클라이언트 요청: 당일 영단어 시험을 보지 않은 학생에게 저녁에 푸시로 알린다.
// 배경: 레거시 앱("루트스터디센터", LUsoft)이 같은 성격의 리마인더를 계속 보내고 있는데
//       우리 응시 기록을 모르기 때문에 이미 응시한 학생에게도 "미응시"라고 보낸다.
//       구 앱 삭제를 안내하려면 그 역할을 우리 앱이 대체해야 해서 만든다.
//
// 대상 판정
//   - 학습일(KST 06:00 시작)이 월~금일 때만. 주말은 개근 집계 대상이 아니라 보내지 않는다.
//   - 지점의 자율등원일(공휴일·휴관, date_type_definitions.is_mandatory=false)은 제외.
//     지각 벌점(fetchMandatoryTime)과 같은 판정을 써서 정책을 일관되게 유지한다.
//   - 그날 입실(check_in) 기록이 있는 재원 학생 중, 그날 vocab_exams 행이 "없는" 학생.
//     행이 있으면(진행 중·자동마감 포함) 제외한다 — UNIQUE(student_id, exam_date) 때문에
//     재응시가 불가능해 리마인더가 무의미하기 때문.
//
// 멱등: vocab_exam_reminders(student_id, study_date) PK 에 claim-first INSERT.
//       선점(ON CONFLICT DO NOTHING 후 반환된 행)한 학생에게만 발송한다.
//
// 안전장치: ?dryRun=true 는 발송 없이 대상자만 반환한다. 첫 배포 시 규모 확인용.

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

const NOTIFICATION = {
  type: 'system' as const,
  title: '오늘의 영단어 시험',
  message: '오늘 영단어 시험을 아직 보지 않았어요. 마감 전에 응시해 주세요.',
  link: '/student/vocab/exam',
};

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const supabase = getSupabaseAdmin();

  // 학습일 산출. 요일 판정은 UTC 자정으로 파싱한 뒤 getUTCDay() — 서버 로컬 타임존에 의존 금지.
  const studyDate = getStudyDate(new Date());
  const studyDateStr = studyDate.toISOString().slice(0, 10);
  const dow = new Date(`${studyDateStr}T00:00:00.000Z`).getUTCDay(); // 0=일 … 6=토
  if (dow === 0 || dow === 6) {
    return NextResponse.json({ success: true, studyDate: studyDateStr, skipped: 'weekend' });
  }

  try {
    // 1) 재원 학생 명단 (승인 완료·미퇴원).
    const { data: studentRows, error: sErr } = await supabase
      .from('student_profiles')
      .select('id, profiles!inner(id, branch_id, is_approved, withdrawn_at)')
      .is('profiles.withdrawn_at', null)
      .eq('profiles.is_approved', true);
    if (sErr) {
      console.error('[vocab-exam-reminder] students', sErr);
      return NextResponse.json({ success: false, error: sErr.message }, { status: 500 });
    }

    type Row = { id: string; profiles: { branch_id: string | null } };
    const students = ((studentRows ?? []) as unknown as Row[]).filter((s) => s.profiles);
    if (students.length === 0) {
      return NextResponse.json({ success: true, studyDate: studyDateStr, candidates: 0 });
    }

    // 2) 지점별 자율등원일(공휴일·휴관) 제외.
    const branchIds = [...new Set(students.map((s) => s.profiles.branch_id).filter(Boolean))];
    const mandatoryByBranch = new Map<string, boolean>();
    for (const branchId of branchIds as string[]) {
      const mt = await fetchMandatoryTime(supabase, branchId, studyDateStr);
      mandatoryByBranch.set(branchId, mt.isMandatory);
    }
    const eligible = students.filter(
      (s) => s.profiles.branch_id && mandatoryByBranch.get(s.profiles.branch_id) !== false,
    );
    if (eligible.length === 0) {
      return NextResponse.json({
        success: true,
        studyDate: studyDateStr,
        skipped: 'non_mandatory_day',
      });
    }
    const eligibleIds = eligible.map((s) => s.id);

    // 3) 그날 입실한 학생만 (시험은 센터 활동 — 결석생에게는 보내지 않는다).
    const { start, end } = getStudyDayBounds(studyDateStr);
    const { data: attRows, error: aErr } = await supabase
      .from('attendance')
      .select('student_id')
      .eq('type', 'check_in')
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .in('student_id', eligibleIds);
    if (aErr) {
      console.error('[vocab-exam-reminder] attendance', aErr);
      return NextResponse.json({ success: false, error: aErr.message }, { status: 500 });
    }
    const attended = new Set((attRows ?? []).map((r) => r.student_id as string));

    // 4) 그날 응시 기록이 있는 학생 제외.
    const { data: examRows, error: eErr } = await supabase
      .from('vocab_exams')
      .select('student_id')
      .eq('exam_date', studyDateStr)
      .in('student_id', eligibleIds);
    if (eErr) {
      console.error('[vocab-exam-reminder] exams', eErr);
      return NextResponse.json({ success: false, error: eErr.message }, { status: 500 });
    }
    const tookExam = new Set((examRows ?? []).map((r) => r.student_id as string));

    const targets = eligibleIds.filter((id) => attended.has(id) && !tookExam.has(id));

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        studyDate: studyDateStr,
        enrolled: students.length,
        eligible: eligibleIds.length,
        attended: attended.size,
        tookExam: tookExam.size,
        candidates: targets.length,
        candidateIds: targets,
      });
    }

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        studyDate: studyDateStr,
        candidates: 0,
        claimed: 0,
        sent: 0,
      });
    }

    // 5) claim-first — 선점된 학생에게만 발송(재실행·동시 실행 중복 차단).
    const { data: claimedRows, error: cErr } = await supabase
      .from('vocab_exam_reminders')
      .upsert(
        targets.map((student_id) => ({ student_id, study_date: studyDateStr })),
        { onConflict: 'student_id,study_date', ignoreDuplicates: true },
      )
      .select('student_id');
    if (cErr) {
      console.error('[vocab-exam-reminder] claim', cErr);
      return NextResponse.json({ success: false, error: cErr.message }, { status: 500 });
    }
    const claimed = (claimedRows ?? []).map((r) => r.student_id as string);

    if (claimed.length === 0) {
      return NextResponse.json({
        success: true,
        studyDate: studyDateStr,
        candidates: targets.length,
        claimed: 0,
        sent: 0,
      });
    }

    // awaitPush: 크론은 응답 반환과 함께 동결될 수 있어 푸시를 반드시 기다린다.
    const res = await createBulkStudentNotifications(claimed, NOTIFICATION, { awaitPush: true });
    if (res?.error) {
      // at-most-once: 발송 실패해도 claim 을 되돌리지 않는다(중복 푸시 방지 우선, daily-focus-notify 와 동일 정책).
      console.error('[vocab-exam-reminder] send failed', res.error);
      return NextResponse.json({
        success: false,
        studyDate: studyDateStr,
        candidates: targets.length,
        claimed: claimed.length,
        sent: 0,
        error: res.error,
      });
    }

    return NextResponse.json({
      success: true,
      studyDate: studyDateStr,
      enrolled: students.length,
      eligible: eligibleIds.length,
      candidates: targets.length,
      claimed: claimed.length,
      sent: claimed.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[vocab-exam-reminder] cron error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
