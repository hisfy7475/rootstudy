import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatDate, getStudyDate } from '@/lib/utils';
import { notifyPointsGranted } from '@/lib/actions/notification';

// Supabase 서비스 롤 클라이언트 (RLS 우회)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// 일일 자동 상점 알림 발송 크론 (KST 09:00 = UTC 00:00, "0 0 * * *")
//
// daily-reset 크론(KST 03:00)은 적립만 하고 notified_at=NULL 로 남긴다.
// 이 크론이 막 끝난 학습일의 미발송(granted=true, notified_at IS NULL) 행을 찾아
// 학생 본인 + 학부모에게 푸시/인앱 알림을 발송하고 notified_at 을 마킹한다.
//
// 멱등성: claim-first (notified_at 선점 UPDATE) 로 중복 트리거/동시 실행 시 재발송 차단.
// 복구: 2일 윈도우로 전날 1회 실패분을 다음날 자동으로 따라잡는다.
export async function GET(request: Request) {
  // Cron secret 검증 (다른 크론과 동일 패턴)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // 막 끝난 학습일 = getStudyDate(now) - 1일.
  // KST 09:00 시점 getStudyDate(now)=오늘 → target=어제 = daily-reset(KST 03:00)이 박은 study_date.
  const todayStudyDate = getStudyDate(new Date());
  const targetStudyDate = new Date(todayStudyDate.getTime() - ONE_DAY_MS);
  const lowerStudyDate = new Date(targetStudyDate.getTime() - ONE_DAY_MS); // 2일 윈도우 하한
  const targetStr = formatDate(targetStudyDate);
  const lowerStr = formatDate(lowerStudyDate);

  try {
    // 미발송 대상 조회. points/profiles 직접 조인으로 amount/reason/type/name 을 한 번에 가져온다.
    const { data: rows, error } = await supabase
      .from('daily_focus_evaluations')
      .select(
        `
        id,
        student_id,
        point_id,
        points!daily_focus_evaluations_point_id_fkey ( amount, reason, type ),
        profiles!daily_focus_evaluations_student_id_fkey ( name )
      `,
      )
      .eq('granted', true)
      .is('notified_at', null)
      .not('point_id', 'is', null)
      .gte('study_date', lowerStr)
      .lte('study_date', targetStr)
      .limit(2000);

    if (error) {
      console.error('[daily-focus-notify] fetch error', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let notified = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows ?? []) {
      // claim-first: 발송 전에 notified_at 을 선점한다. 0행이면 다른 실행이 이미 선점 → skip.
      const { data: claimed } = await supabase
        .from('daily_focus_evaluations')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', row.id)
        .is('notified_at', null)
        .select('id')
        .maybeSingle();

      if (!claimed) {
        skipped++;
        continue;
      }

      try {
        const point = Array.isArray(row.points) ? row.points[0] : row.points;
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (!point) {
          // point_id 는 있는데 조인이 비면 데이터 불일치 — 마킹은 유지하고 스킵 카운트.
          console.error('[daily-focus-notify] missing point for eval', row.id);
          errors++;
          continue;
        }

        await notifyPointsGranted(
          {
            studentId: row.student_id,
            type: (point as { type: 'reward' | 'penalty' }).type,
            amount: (point as { amount: number }).amount,
            reason: (point as { reason: string }).reason,
            studentName: (profile as { name?: string | null })?.name ?? undefined,
          },
          { awaitPush: true },
        );
        notified++;
      } catch (e) {
        // at-most-once: 발송 실패해도 notified_at 롤백하지 않는다(중복 푸시 방지 우선).
        console.error('[daily-focus-notify] send failed', row.id, e);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      targetStr,
      lowerStr,
      candidates: rows?.length ?? 0,
      notified,
      skipped,
      errors,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[daily-focus-notify] cron error:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
