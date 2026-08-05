'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { sendPushToUser, sendPushToUsers } from '@/lib/push';
import { revalidatePath } from 'next/cache';

// ============================================
// 학생 알림 관련
// ============================================

// 학생 알림 목록 조회 (페이지네이션 + 타입 필터 옵션).
// 기존 인자 없는 호출은 limit 50, offset 0 으로 동작한다.
export async function getStudentNotifications(
  opts: {
    limit?: number;
    offset?: number;
    excludeTypes?: NotificationType[];
  } = {},
) {
  const { limit = 50, offset = 0, excludeTypes } = opts;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('student_notifications')
    .select('*')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (excludeTypes && excludeTypes.length > 0) {
    query = query.not('type', 'in', `(${excludeTypes.map((t) => `"${t}"`).join(',')})`);
  }

  const { data } = await query;
  return data || [];
}

// 읽지 않은 알림 수 조회. excludeTypes 로 뱃지 카운트용 chat 제외 등 지원.
export async function getUnreadNotificationCount(
  opts: {
    excludeTypes?: NotificationType[];
  } = {},
) {
  const { excludeTypes } = opts;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  let query = supabase
    .from('student_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .eq('is_read', false);

  if (excludeTypes && excludeTypes.length > 0) {
    query = query.not('type', 'in', `(${excludeTypes.map((t) => `"${t}"`).join(',')})`);
  }

  const { count } = await query;
  return count || 0;
}

// 알림 읽음 처리 (단일)
export async function markNotificationAsRead(notificationId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('student_notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('student_id', user.id);

  if (error) {
    console.error('Error marking notification as read:', error);
    return { error: '알림 처리에 실패했습니다.' };
  }

  revalidatePath('/student/notifications');
  return { success: true };
}

// 모든 알림 읽음 처리
export async function markAllNotificationsAsRead() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('student_notifications')
    .update({ is_read: true })
    .eq('student_id', user.id)
    .eq('is_read', false);

  if (error) {
    console.error('Error marking all notifications as read:', error);
    return { error: '알림 처리에 실패했습니다.' };
  }

  revalidatePath('/student/notifications');
  return { success: true };
}

// ============================================
// 알림 생성 (관리자/시스템용)
// ============================================

type NotificationType = 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';

function pushDataFromLink(link?: string): { path: string } | undefined {
  if (!link || !link.startsWith('/')) return undefined;
  return { path: link };
}

interface CreateNotificationParams {
  studentId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

// ============================================
// 범용 알림 (user_notifications 테이블 사용)
// ============================================

interface CreateUserNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

// 범용 알림 생성 (앱 내 알림)
//
// invariant: 알림 INSERT는 시스템 이벤트의 부산물이므로 admin client(service role)로 처리한다.
// 호출자(메시지 송신자) auth 컨텍스트의 RLS에 막혀 silent fail 되던 회귀를 차단하기 위함.
// SELECT/UPDATE/DELETE는 본인 한정으로 user client + RLS 유지(보안 경계 보존).
// admin client는 helper 내부에서만 생성/사용 — export하거나 인자로 받지 않는다.
// opts.awaitPush=true 면 푸시 fetch 완료까지 await 한다. 서버리스 크론처럼
// 응답 직후 핸들러가 동결돼 fire-and-forget 푸시가 누락될 수 있는 환경에서 사용.
// 기본(false)은 기존 호출처 동작 유지(인앱 INSERT만 await, 푸시는 비동기).
export async function createUserNotification(
  params: CreateUserNotificationParams,
  opts: { awaitPush?: boolean } = {},
) {
  const supabase = createAdminClient();

  const { error } = await supabase.from('user_notifications').insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
  });

  if (error) {
    if (error.code === '23503') {
      return { error: 'user_not_found' };
    }
    console.error('[notification][insert-failed] user_notifications', error);
    return { error: '알림 생성에 실패했습니다.' };
  }

  const pushPromise = sendPushToUser(
    params.userId,
    params.title,
    params.message,
    pushDataFromLink(params.link),
  ).catch((e) => console.error('[push] createUserNotification', e));
  if (opts.awaitPush) await pushPromise;

  return { success: true };
}

// 범용 알림 목록 조회 (페이지네이션 + 타입 필터 옵션).
export async function getUserNotifications(
  opts: {
    limit?: number;
    offset?: number;
    excludeTypes?: NotificationType[];
  } = {},
) {
  const { limit = 50, offset = 0, excludeTypes } = opts;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (excludeTypes && excludeTypes.length > 0) {
    query = query.not('type', 'in', `(${excludeTypes.map((t) => `"${t}"`).join(',')})`);
  }

  const { data } = await query;
  return data || [];
}

// 범용 읽지 않은 알림 수 조회. excludeTypes 로 뱃지 카운트용 chat 제외 등 지원.
export async function getUnreadUserNotificationCount(
  opts: {
    excludeTypes?: NotificationType[];
  } = {},
) {
  const { excludeTypes } = opts;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  let query = supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (excludeTypes && excludeTypes.length > 0) {
    query = query.not('type', 'in', `(${excludeTypes.map((t) => `"${t}"`).join(',')})`);
  }

  const { count } = await query;
  return count || 0;
}

// 범용 알림 읽음 처리 (단일)
export async function markUserNotificationAsRead(notificationId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error marking user notification as read:', error);
    return { error: '알림 처리에 실패했습니다.' };
  }

  return { success: true };
}

// 범용 모든 알림 읽음 처리
export async function markAllUserNotificationsAsRead() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('user_notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  if (error) {
    console.error('Error marking all user notifications as read:', error);
    return { error: '알림 처리에 실패했습니다.' };
  }

  return { success: true };
}

// 학생 알림 생성 (앱 내 알림)
// invariant: createUserNotification 위 주석 참조 — INSERT는 admin client.
export async function createStudentNotification(
  params: CreateNotificationParams,
  opts: { awaitPush?: boolean } = {},
) {
  const supabase = createAdminClient();

  const { error } = await supabase.from('student_notifications').insert({
    student_id: params.studentId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
  });

  if (error) {
    console.error('[notification][insert-failed] student_notifications', error);
    return { error: '알림 생성에 실패했습니다.' };
  }

  const pushPromise = sendPushToUser(
    params.studentId,
    params.title,
    params.message,
    pushDataFromLink(params.link),
  ).catch((e) => console.error('[push] createStudentNotification', e));
  if (opts.awaitPush) await pushPromise;

  return { success: true };
}

// 다수 학생에게 알림 생성
// invariant: createUserNotification 위 주석 참조 — INSERT는 admin client.
//
// opts.awaitPush: 크론(서버리스)에서 호출할 때는 반드시 true 로 넘긴다.
// 기본값(false)은 푸시를 띄워 보내는데, 크론은 응답 반환과 함께 인보케이션이 동결될 수 있어
// 그 상태로는 푸시가 통째로 유실된다. createStudentNotification 과 동일한 옵션.
export async function createBulkStudentNotifications(
  studentIds: string[],
  notification: Omit<CreateNotificationParams, 'studentId'>,
  opts: { awaitPush?: boolean } = {},
) {
  const supabase = createAdminClient();

  const notifications = studentIds.map((studentId) => ({
    student_id: studentId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
  }));

  const { error } = await supabase.from('student_notifications').insert(notifications);

  if (error) {
    console.error('[notification][insert-failed] student_notifications bulk', error);
    return { error: '알림 생성에 실패했습니다.' };
  }

  const pushPromise = sendPushToUsers(
    studentIds,
    notification.title,
    notification.message,
    pushDataFromLink(notification.link),
  ).catch((e) => console.error('[push] createBulkStudentNotifications', e));
  if (opts.awaitPush) await pushPromise;

  return { success: true };
}

// ============================================
// 상/벌점 부과 알림 (학생 + 모든 학부모 일괄)
// ============================================

// 진입점: givePoints / givePenaltyBatch / giveRewardBatch / giveAutoPoints /
//        weekly-points cron / daily-reset cron / attendance penalty 에서 호출.
// 학생 본인 + 연결된 모든 학부모에게 앱 알림 + 푸시 동시 발송.
export async function notifyPointsGranted(
  params: {
    studentId: string;
    type: 'reward' | 'penalty';
    amount: number;
    reason: string;
    studentName?: string; // 호출자가 보유 시 전달 — N+1 회피
  },
  opts: { awaitPush?: boolean } = {},
): Promise<void> {
  const supabase = createAdminClient();

  let studentName = params.studentName;
  if (!studentName) {
    const { data } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', params.studentId)
      .maybeSingle();
    studentName = data?.name ?? '학생';
  }

  const { data: parentLinks } = await supabase
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', params.studentId);
  const parentIds = (parentLinks ?? []).map((l) => l.parent_id as string);

  const sign = params.type === 'penalty' ? '-' : '+';
  const title = params.type === 'reward' ? '상점이 부여되었습니다' : '벌점이 부여되었습니다';
  const message = `${studentName} 학생, ${params.reason} (${sign}${params.amount}점)`;

  const tasks: Promise<unknown>[] = [
    createStudentNotification(
      {
        studentId: params.studentId,
        type: 'point',
        title,
        message,
        link: '/student/points',
      },
      { awaitPush: opts.awaitPush },
    ),
  ];

  for (const parentId of parentIds) {
    tasks.push(
      createUserNotification(
        {
          userId: parentId,
          type: 'point',
          title,
          message,
          link: '/parent',
        },
        { awaitPush: opts.awaitPush },
      ),
    );
  }

  await Promise.allSettled(tasks);
}

// ============================================
// 분기 벌점 임계 알림 (10/20/25 단계 경고 + 30점 도달 처리 결과)
// ============================================

export type PenaltyWarning = 'warn_10' | 'warn_20' | 'warn_25';

export type PenaltyThresholdResult =
  | {
      status: 'offset';
      offset_amount: number;
      reward_after: number;
      penalty_after_net: number;
      will_require_withdrawal: false;
      protected_queue_count: number;
      offset_already_consumed?: boolean;
    }
  | {
      status: 'withdrawal_required';
      offset_amount: 0;
      reward_after: number;
      penalty_after_net: number;
      will_require_withdrawal: true;
      protected_queue_count: number;
      offset_already_consumed?: boolean;
    }
  | { status: 'already_classified' }
  | { status: 'dismissed_this_quarter'; dismissed_at: string; dismissed_net: number | null }
  | { status: 'not_classified' }
  | { status: 'not_a_student' };

const WARNING_MESSAGES: Record<PenaltyWarning, { title: string; message: string }> = {
  warn_10: {
    title: '분기 벌점 10점에 도달했어요',
    message: '학습 페이스를 조금만 더 신경 써주세요.',
  },
  warn_20: {
    title: '주의 — 분기 벌점 20점 도달',
    message: '30점 도달 시 보유 상점과 1:1 상계됩니다.',
  },
  warn_25: {
    title: '경고 — 분기 벌점 25점 도달',
    message: '5점만 더 쌓이면 보유 상점과 상계됩니다. 상점이 부족하면 강제 퇴원 대상이 됩니다.',
  },
};

/**
 * give_penalty_with_threshold_check RPC 의 반환값(warnings / threshold)을 학생 알림으로 전달한다.
 *
 * 이 헬퍼가 없던 시절에는 관리자 수동 부여(givePoints)에만 인라인으로 구현돼 있어,
 * 주간 정산 크론·자동 지각·일괄 부여로 임계를 넘긴 학생은 아무 통보도 받지 못했다.
 * 벌점 RPC 를 호출하는 모든 경로는 반환값을 이 함수로 넘겨야 한다.
 */
export async function notifyPenaltyThreshold(params: {
  studentId: string;
  warnings: PenaltyWarning[];
  threshold: PenaltyThresholdResult | null;
}): Promise<void> {
  const { studentId, warnings, threshold } = params;
  const tasks: Promise<unknown>[] = [];

  for (const w of warnings ?? []) {
    const m = WARNING_MESSAGES[w];
    if (!m) continue;
    tasks.push(
      createStudentNotification({
        studentId,
        type: 'point',
        title: m.title,
        message: m.message,
        link: '/student/points',
      }),
    );
  }

  if (threshold?.status === 'offset') {
    tasks.push(
      createStudentNotification({
        studentId,
        type: 'point',
        title: '벌점 30점 도달 — 상점과 상계되었습니다',
        message: `상점 ${threshold.offset_amount}점이 벌점과 상계되었습니다. 잔존 벌점 ${threshold.penalty_after_net}점.`,
        link: '/student/points',
      }),
    );
  } else if (threshold?.status === 'withdrawal_required') {
    // ⚠️ 학생에게는 알리지 않는다. 강제 퇴원 분류는 시스템이 자동으로 하되,
    //    통보는 관리자가 '학생에게 통보' 를 누를 때만 나간다.
    //    오판이 학생·학부모에게 먼저 도달하면 관리자가 지워도 이미 본 뒤다.
    //
    //    대신 관리자에게 알린다 — 통보 게이트 때문에 학생 쪽은 조용하므로,
    //    이 알림이 없으면 관리자가 큐를 열어보기 전까지 분류 사실을 모른다.
    tasks.push(notifyAdminsOfWithdrawalClassification({ studentId }));
  }
  // 나머지 status(already_classified / dismissed_this_quarter / …)는 통보 대상이 아니다.

  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
}

// 강제 퇴원 분류를 학생에게 통보한다. 관리자가 명시적으로 실행할 때만 호출된다.
//
// 사유를 구분한다 — 상점이 남아 있는데 "상계 가능한 상점이 없어"라고 통보하면
// 학생·학부모가 시스템 오류로 받아들인다. 발급 대기 1건당 100점이 보호되므로
// 잔액이 있어도 가용은 0일 수 있고, 상계를 이미 소진한 경우도 있다.
export async function notifyWithdrawalClassifiedStudent(params: {
  studentId: string;
  offsetAlreadyConsumed: boolean;
}): Promise<void> {
  const { studentId, offsetAlreadyConsumed } = params;
  await createStudentNotification({
    studentId,
    type: 'point',
    title: '강제 퇴원 대상으로 분류되었습니다',
    message: offsetAlreadyConsumed
      ? '상점 상계가 이미 적용되어, 벌점 30점 재도달로 강제 퇴원 대상이 되었습니다.'
      : '상계 가능한 상점이 부족하여 강제 퇴원 대상으로 분류되었습니다.',
    link: '/student/points',
  });
}

// 자동 분류가 발생했음을 해당 지점 관리자에게 알린다.
//
// 통보 게이트 때문에 학생에게는 아무것도 나가지 않으므로, 관리자가 큐를 직접 열어보지
// 않으면 분류 사실을 영영 모른다. 그러면 게이트가 문제를 감추는 장치가 되어버린다.
export async function notifyAdminsOfWithdrawalClassification(params: {
  studentId: string;
  studentName?: string;
  reason?: string | null;
}): Promise<void> {
  const { studentId, studentName, reason } = params;
  const supabase = createAdminClient();

  const { data: student } = await supabase
    .from('profiles')
    .select('name, branch_id')
    .eq('id', studentId)
    .maybeSingle();

  const branchId = (student?.branch_id as string | null) ?? null;
  const name = studentName || (student?.name as string | undefined) || '학생';

  // 동일 지점 관리자 + 최고 관리자
  let q = supabase
    .from('profiles')
    .select('id, branch_id, is_super_admin')
    .eq('user_type', 'admin');
  if (branchId) {
    q = q.or(`branch_id.eq.${branchId},is_super_admin.eq.true`);
  }
  const { data: admins } = await q;
  if (!admins || admins.length === 0) return;

  await Promise.allSettled(
    (admins as Array<{ id: string }>).map((a) =>
      createUserNotification(
        {
          userId: a.id,
          type: 'system',
          title: '강제 퇴원 대상 자동 분류 — 통보 대기',
          message: `${name} 학생이 벌점 30점 도달로 분류되었습니다. 학생에게는 아직 통보되지 않았습니다.${
            reason ? ` (${reason})` : ''
          }`,
          link: '/admin/points?tab=review',
        },
        // 주간 크론(서버리스)에서 호출되므로 푸시까지 await 한다.
        // 학생 통보가 게이트로 막혀 있어 이 알림이 유일한 통지 수단이다.
        { awaitPush: true },
      ),
    ),
  );
}

// ============================================
// 영단어 시험 제출 알림 (연결된 모든 학부모)
// ============================================

// 진입점: vocab.ts finalizeExam 의 정상 제출(normal) 마감 지점에서 호출.
// 학생이 영단어 시험을 제출하면 연결된 학부모에게 완료·점수 알림 + 푸시를 보낸다.
// 링크가 '/'로 시작 → createUserNotification 내부에서 자동 푸시(딥링크 /parent/report).
export async function notifyVocabExamSubmitted(
  params: {
    studentId: string;
    score: number;
    total: number;
    studentName?: string; // 호출자가 보유 시 전달 — N+1 회피
  },
  opts: { awaitPush?: boolean } = {},
): Promise<void> {
  const supabase = createAdminClient();

  let studentName = params.studentName;
  if (!studentName) {
    const { data } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', params.studentId)
      .maybeSingle();
    studentName = data?.name ?? '학생';
  }

  const { data: parentLinks } = await supabase
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', params.studentId);
  const parentIds = (parentLinks ?? []).map((l) => l.parent_id as string);
  if (parentIds.length === 0) return;

  const title = '영단어 시험 완료';
  const message = `${studentName} 학생이 영단어 시험을 완료했습니다 (${params.score}/${params.total}점)`;

  await Promise.allSettled(
    parentIds.map((parentId) =>
      createUserNotification(
        {
          userId: parentId,
          type: 'system',
          title,
          message,
          link: '/parent/report',
        },
        { awaitPush: opts.awaitPush },
      ),
    ),
  );
}
