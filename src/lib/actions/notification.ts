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
export async function createBulkStudentNotifications(
  studentIds: string[],
  notification: Omit<CreateNotificationParams, 'studentId'>,
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

  void sendPushToUsers(
    studentIds,
    notification.title,
    notification.message,
    pushDataFromLink(notification.link),
  ).catch((e) => console.error('[push] createBulkStudentNotifications', e));

  return { success: true };
}

// ============================================
// 상/벌점 부과 알림 (학생 + 모든 학부모 일괄)
// ============================================

// 진입점: givePoints / givePointsBatch / giveRewardBatch / giveAutoPoints /
//        weekly-points cron / daily-reset cron 6곳에서 호출.
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
