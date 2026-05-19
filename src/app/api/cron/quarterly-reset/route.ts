import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 단계 11: 분기 초기화 크론
 *
 * Vercel cron 은 UTC 기준. KST 분기 첫날(3·6·9·12 월 1일) 감지를 위해
 * 매일 KST 00:30 (= UTC 15:30) 발사 → 오늘이 KST 분기 첫날이면 처리.
 *
 * 처리 내용:
 * - withdrawal_review_at IS NOT NULL 인 학생의 검토 상태 해제 (NULL 로)
 *   (단, profiles.withdrawn_at 이 이미 세팅된 학생은 그대로 — 확정 퇴원 상태 유지)
 * - threshold_consumed_in_quarter_at 리셋 (invariant 3 — 같은 분기 1회 제한 해제)
 * - last_warned_at_10/20/25 리셋 (새 분기에 단계 알림 재발사 가능)
 *
 * 멱등: 분기 첫날이 아니면 no-op. 분기 첫날에도 이미 NULL 인 행은 영향 없음.
 */

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// KST 기준 오늘이 분기 첫날인지 (월=3,6,9,12 AND 일=1)
function isQuarterFirstDayKST(now: Date = new Date()): boolean {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const month = kst.getUTCMonth() + 1; // 1..12
  const day = kst.getUTCDate();
  return day === 1 && [3, 6, 9, 12].includes(month);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isFirstDay = isQuarterFirstDayKST();
  if (!isFirstDay) {
    return NextResponse.json({
      success: true,
      message: 'Not a quarter first day in KST — no-op',
    });
  }

  const supabase = getSupabaseAdmin();

  // 1) 검토 상태 해제 — 확정 퇴원자 제외
  const { data: resetReviewRows, error: resetReviewError } = await supabase
    .from('student_profiles')
    .update({
      withdrawal_review_at: null,
      withdrawal_review_reason: null,
      threshold_consumed_in_quarter_at: null,
      last_warned_at_10: null,
      last_warned_at_20: null,
      last_warned_at_25: null,
    })
    .not('withdrawal_review_at', 'is', null)
    .select('id, profiles!inner(withdrawn_at)');

  if (resetReviewError) {
    console.error('quarterly-reset review error:', resetReviewError);
    return NextResponse.json({ success: false, error: resetReviewError.message }, { status: 500 });
  }

  // 확정 퇴원자는 제외 (post-filter)
  const reviewReset =
    resetReviewRows?.filter((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return !(p as { withdrawn_at?: string | null })?.withdrawn_at;
    }) ?? [];

  // 2) 검토 상태가 없지만 threshold_consumed 또는 last_warned 가 남아있는 학생도 리셋
  const { error: resetMiscError } = await supabase
    .from('student_profiles')
    .update({
      threshold_consumed_in_quarter_at: null,
      last_warned_at_10: null,
      last_warned_at_20: null,
      last_warned_at_25: null,
    })
    .or(
      'threshold_consumed_in_quarter_at.not.is.null,last_warned_at_10.not.is.null,last_warned_at_20.not.is.null,last_warned_at_25.not.is.null',
    );

  if (resetMiscError) {
    console.error('quarterly-reset misc error:', resetMiscError);
  }

  // 3) 학생/관리자 인앱 알림 (학부모는 노이즈 방지로 알림톡 미발송)
  const { createBulkStudentNotifications } = await import('@/lib/actions/notification');

  if (reviewReset.length > 0) {
    await createBulkStudentNotifications(
      reviewReset.map((r) => r.id),
      {
        type: 'point',
        title: '새 분기가 시작되었습니다',
        message: '벌점 누적이 0으로 초기화되었습니다. 새 분기 화이팅!',
        link: '/student/points',
      },
    ).catch(console.error);
  }

  return NextResponse.json({
    success: true,
    message: `Quarterly reset completed`,
    reviewReset: reviewReset.length,
  });
}
