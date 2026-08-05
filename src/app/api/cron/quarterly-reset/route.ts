import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 단계 11: 분기 초기화 크론
 *
 * Vercel cron 은 UTC 기준. KST 분기 첫날(3·6·9·12 월 1일) 감지를 위해
 * 매일 KST 00:30 (= UTC 15:30) 발사 → 오늘이 KST 분기 첫날이면 처리.
 *
 * 처리 내용:
 * - withdrawal_review_at / withdrawal_required_at IS NOT NULL 인 학생의 마크 해제 (NULL 로)
 *   (단, profiles.withdrawn_at 이 이미 세팅된 학생은 그대로 — 확정 퇴원 상태 유지)
 * - threshold_consumed_in_quarter_at 리셋 (구 정책 호환 — 같은 분기 1회 제한 해제)
 * - last_warned_at_10/20/25 리셋 (새 분기에 단계 알림 재발사 가능)
 * - penalty_offset_in_quarter_total 0 으로 리셋
 *   (DEPRECATED — 상계 누계는 이제 points 원장에서 파생한다. 판정에는 쓰이지 않지만
 *    롤백 시 낡은 값으로 이중 상계가 나지 않도록 컬럼 DROP 전까지 리셋을 유지한다.)
 *
 * 멱등: 분기 첫날이 아니면 no-op. 분기 첫날에도 이미 NULL/0 인 행은 영향 없음.
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
  const errors: string[] = [];

  // 1) 검토/강제 퇴원 마크 해제 — 확정 퇴원자 제외
  //
  // 대상을 UPDATE 전에 확정한다. 예전에는 `.or(...).select('id, profiles!inner(withdrawn_at)')`
  // 로 UPDATE 한 뒤 결과를 post-filter 했는데, `!inner` 는 UPDATE 대상이 아니라 반환 표현에만
  // 적용되므로 확정 퇴원자의 마크까지 이미 지워진 뒤였다.
  // 마크 보유자만 조회하므로 `.in()` 에 실리는 id 수도 활성 학생 전체가 아니라 소수다.
  let reviewResetIds: string[] = [];
  const { data: markedTargets, error: targetsError } = await supabase
    .from('student_profiles')
    .select('id, profiles!inner(withdrawn_at)')
    .or('withdrawal_review_at.not.is.null,withdrawal_required_at.not.is.null')
    .is('profiles.withdrawn_at', null);

  if (targetsError) {
    console.error('quarterly-reset targets error:', targetsError);
    errors.push(`targets: ${targetsError.message}`);
  } else {
    reviewResetIds = (markedTargets ?? []).map((r) => r.id as string);

    if (reviewResetIds.length > 0) {
      const { error: resetReviewError } = await supabase
        .from('student_profiles')
        .update({
          withdrawal_review_at: null,
          withdrawal_review_reason: null,
          withdrawal_required_at: null,
          withdrawal_required_reason: null,
          threshold_consumed_in_quarter_at: null,
          penalty_offset_in_quarter_total: 0,
          last_warned_at_10: null,
          last_warned_at_20: null,
          last_warned_at_25: null,
        })
        .in('id', reviewResetIds);

      if (resetReviewError) {
        console.error('quarterly-reset review error:', resetReviewError);
        errors.push(`review: ${resetReviewError.message}`);
        // 여기서 return 하면 아래 2)가 통째로 건너뛰어진다. 오류만 모으고 계속 진행한다.
        reviewResetIds = [];
      }
    }
  }

  // 2) 검토/강제 퇴원 마크가 없지만 분기 상태가 남아있는 학생도 리셋
  //
  // last_warned_at_* 는 RPC 가 `< 분기시작` 비교로 이미 방어하므로 이 리셋이 실패해도
  // 경고가 유실되지는 않는다. penalty_offset_in_quarter_total 은 판정에 쓰이지 않지만
  // (원장 파생으로 전환) 롤백 안전성을 위해 계속 리셋한다 — 컬럼 DROP 시 함께 제거할 것.
  const { error: resetMiscError } = await supabase
    .from('student_profiles')
    .update({
      threshold_consumed_in_quarter_at: null,
      penalty_offset_in_quarter_total: 0,
      last_warned_at_10: null,
      last_warned_at_20: null,
      last_warned_at_25: null,
    })
    .or(
      'threshold_consumed_in_quarter_at.not.is.null,penalty_offset_in_quarter_total.gt.0,last_warned_at_10.not.is.null,last_warned_at_20.not.is.null,last_warned_at_25.not.is.null',
    );

  if (resetMiscError) {
    console.error('quarterly-reset misc error:', resetMiscError);
    errors.push(`misc: ${resetMiscError.message}`);
  }

  // 3) 학생/관리자 인앱 알림
  const { createBulkStudentNotifications } = await import('@/lib/actions/notification');

  if (reviewResetIds.length > 0) {
    await createBulkStudentNotifications(
      reviewResetIds,
      {
        type: 'point',
        title: '새 분기가 시작되었습니다',
        message: '벌점 누적이 0으로 초기화되었습니다. 새 분기 화이팅!',
        link: '/student/points',
      },
      // 크론은 응답 반환과 함께 인보케이션이 동결될 수 있어 푸시를 반드시 await 한다.
      { awaitPush: true },
    ).catch(console.error);
  }

  // 분기 첫날 실행 여부를 Vercel 로그에서 확인할 수 있게 남긴다.
  // (2026-06-01 미동작 당시 실행 자체가 없었는지 UPDATE 가 실패했는지 구분할 수 없었다.)
  console.info(
    `[quarterly-reset] 실행 완료 — 마크 해제 ${reviewResetIds.length}명, 오류 ${errors.length}건`,
  );

  return NextResponse.json({
    success: errors.length === 0,
    message: 'Quarterly reset completed',
    reviewReset: reviewResetIds.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
