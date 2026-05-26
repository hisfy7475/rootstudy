import { NextResponse } from 'next/server';
// [알림톡 비활성화 2026-05-26] 카카오 알림톡 자체가 비활성화되어 재시도 큐도 처리할 의미가 없음.
// 부활 시: 아래 본문 주석을 모두 해제하고 vercel.json의 cron 등록도 함께 복구할 것.
// import { createClient } from '@supabase/supabase-js';

/**
 * 백로그 6: critical 학부모 알림톡 재시도 큐 처리.
 *
 * 매 5분 발사 → pending + next_attempt_at <= now() 인 행을 처리.
 * - 발송 성공 → succeeded
 * - 실패 (attempts < 3) → next_attempt_at = now + backoff(5min/30min/2h)
 * - 실패 (attempts == 3) → failed_final + 관리자 사내 알림
 */

// [알림톡 비활성화 2026-05-26]
// const BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]; // 1차/2차/3차
//
// function getSupabaseAdmin() {
//   const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
//   const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
//   return createClient(url, key);
// }

export async function GET(request: Request) {
  // [알림톡 비활성화 2026-05-26] vercel.json에서 cron 등록이 제거되어 정상적으로는 호출되지 않음.
  // 외부에서 직접 호출될 경우를 대비해 인증만 검사하고 no-op으로 200 반환.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ success: true, processed: 0, skipped: 'alimtalk-disabled' });

  // ----- 부활 시 아래 주석을 해제 -----
  // const supabase = getSupabaseAdmin();
  //
  // const { data: pending, error } = await supabase
  //   .from('kakao_retry_queue')
  //   .select('id, parent_id, student_id, message, category, attempts')
  //   .eq('status', 'pending')
  //   .lte('next_attempt_at', new Date().toISOString())
  //   .order('next_attempt_at', { ascending: true })
  //   .limit(50);
  //
  // if (error) {
  //   console.error('kakao-retry fetch error:', error);
  //   return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  // }
  // if (!pending || pending.length === 0) {
  //   return NextResponse.json({ success: true, processed: 0 });
  // }
  //
  // const { sendKakaoAlimtalkToParent } = await import('@/lib/actions/notification');
  // let succeeded = 0;
  // let retried = 0;
  // let failedFinal = 0;
  //
  // for (const row of pending) {
  //   const result = await sendKakaoAlimtalkToParent({
  //     parentId: row.parent_id,
  //     studentId: row.student_id,
  //     message: row.message,
  //     type: 'point',
  //   }).catch((e) => ({ success: false, error: e instanceof Error ? e.message : 'unknown' }));
  //
  //   if (result.success) {
  //     await supabase
  //       .from('kakao_retry_queue')
  //       .update({
  //         status: 'succeeded',
  //         succeeded_at: new Date().toISOString(),
  //         updated_at: new Date().toISOString(),
  //         attempts: row.attempts + 1,
  //       })
  //       .eq('id', row.id);
  //     succeeded++;
  //   } else {
  //     const nextAttempts = row.attempts + 1;
  //     if (nextAttempts >= 3) {
  //       await supabase
  //         .from('kakao_retry_queue')
  //         .update({
  //           status: 'failed_final',
  //           attempts: nextAttempts,
  //           last_error: result.error ?? 'unknown',
  //           updated_at: new Date().toISOString(),
  //         })
  //         .eq('id', row.id);
  //       failedFinal++;
  //
  //       // 관리자 사내 알림 (학생 branch admin 목록에 알림)
  //       try {
  //         const { data: studentProfile } = await supabase
  //           .from('profiles')
  //           .select('name, branch_id')
  //           .eq('id', row.student_id)
  //           .single();
  //         if (studentProfile?.branch_id) {
  //           const { data: admins } = await supabase
  //             .from('profiles')
  //             .select('id')
  //             .eq('user_type', 'admin')
  //             .eq('branch_id', studentProfile.branch_id);
  //           const { createUserNotification } = await import('@/lib/actions/notification');
  //           for (const a of admins ?? []) {
  //             await createUserNotification({
  //               userId: a.id,
  //               type: 'system',
  //               title: '학부모 알림톡 발송 실패',
  //               message: `${studentProfile.name} 학생 학부모에게 ${row.category} 알림톡 3회 재시도 실패. 수동 연락 필요.`,
  //               link: '/admin/points',
  //             }).catch(console.error);
  //           }
  //         }
  //       } catch (e) {
  //         console.error('kakao-retry admin notify error:', e);
  //       }
  //     } else {
  //       const backoffMs = BACKOFF_MS[Math.min(nextAttempts, BACKOFF_MS.length - 1)];
  //       await supabase
  //         .from('kakao_retry_queue')
  //         .update({
  //           attempts: nextAttempts,
  //           next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
  //           last_error: result.error ?? 'unknown',
  //           updated_at: new Date().toISOString(),
  //         })
  //         .eq('id', row.id);
  //       retried++;
  //     }
  //   }
  // }
  //
  // return NextResponse.json({
  //   success: true,
  //   processed: pending.length,
  //   succeeded,
  //   retried,
  //   failedFinal,
  // });
}
