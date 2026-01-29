'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================
// 학생 알림 관련
// ============================================

// 학생 알림 목록 조회
export async function getStudentNotifications(limit: number = 50) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('student_notifications')
    .select('*')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

// 읽지 않은 알림 수 조회
export async function getUnreadNotificationCount() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from('student_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .eq('is_read', false);

  return count || 0;
}

// 알림 읽음 처리 (단일)
export async function markNotificationAsRead(notificationId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
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

  const { data: { user } } = await supabase.auth.getUser();
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
// 푸시 구독 관련
// ============================================

interface PushSubscriptionData {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  userAgent?: string;
}

// 푸시 구독 저장
export async function savePushSubscription(subscriptionData: PushSubscriptionData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint: subscriptionData.endpoint,
      p256dh_key: subscriptionData.p256dhKey,
      auth_key: subscriptionData.authKey,
      user_agent: subscriptionData.userAgent,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,endpoint',
    });

  if (error) {
    console.error('Error saving push subscription:', error);
    return { error: '푸시 구독 저장에 실패했습니다.' };
  }

  return { success: true };
}

// 푸시 구독 삭제
export async function deletePushSubscription(endpoint: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) {
    console.error('Error deleting push subscription:', error);
    return { error: '푸시 구독 삭제에 실패했습니다.' };
  }

  return { success: true };
}

// 푸시 구독 비활성화 (endpoint 기반)
export async function deactivatePushSubscription(endpoint: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) {
    console.error('Error deactivating push subscription:', error);
    return { error: '푸시 구독 비활성화에 실패했습니다.' };
  }

  return { success: true };
}

// ============================================
// 알림 생성 (관리자/시스템용)
// ============================================

type NotificationType = 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';

interface CreateNotificationParams {
  studentId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

// 학생 알림 생성 (앱 내 + 선택적 웹 푸시)
export async function createStudentNotification(params: CreateNotificationParams) {
  const supabase = await createClient();

  // 앱 내 알림 저장
  const { error } = await supabase
    .from('student_notifications')
    .insert({
      student_id: params.studentId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link,
    });

  if (error) {
    console.error('Error creating notification:', error);
    return { error: '알림 생성에 실패했습니다.' };
  }

  // 웹 푸시 발송 시도 (환경변수가 설정된 경우에만)
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    await sendWebPushToStudent(params.studentId, {
      title: params.title,
      body: params.message,
      data: { url: params.link || '/student/notifications' },
    });
  }

  return { success: true };
}

// 다수 학생에게 알림 생성
export async function createBulkStudentNotifications(
  studentIds: string[],
  notification: Omit<CreateNotificationParams, 'studentId'>
) {
  const supabase = await createClient();

  const notifications = studentIds.map(studentId => ({
    student_id: studentId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
  }));

  const { error } = await supabase
    .from('student_notifications')
    .insert(notifications);

  if (error) {
    console.error('Error creating bulk notifications:', error);
    return { error: '알림 생성에 실패했습니다.' };
  }

  // 웹 푸시 발송 (환경변수가 설정된 경우에만)
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    await Promise.allSettled(
      studentIds.map(studentId => 
        sendWebPushToStudent(studentId, {
          title: notification.title,
          body: notification.message,
          data: { url: notification.link || '/student/notifications' },
        })
      )
    );
  }

  return { success: true };
}

// ============================================
// 웹 푸시 발송 (내부 함수)
// ============================================

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

// 특정 학생에게 웹 푸시 발송
async function sendWebPushToStudent(studentId: string, payload: PushPayload) {
  const supabase = await createClient();

  // 학생의 활성 푸시 구독 조회
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', studentId)
    .eq('is_active', true);

  if (!subscriptions || subscriptions.length === 0) {
    return { success: false, reason: 'No active subscriptions' };
  }

  // 각 구독에 푸시 발송
  const results = await Promise.allSettled(
    subscriptions.map(sub => sendWebPush(sub, payload))
  );

  // 실패한 구독 비활성화
  const failedEndpoints: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)) {
      failedEndpoints.push(subscriptions[index].endpoint);
    }
  });

  if (failedEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('user_id', studentId)
      .in('endpoint', failedEndpoints);
  }

  return { success: true, sent: subscriptions.length - failedEndpoints.length };
}

// 웹 푸시 발송 (단일 구독)
async function sendWebPush(
  subscription: { endpoint: string; p256dh_key: string; auth_key: string },
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  // VAPID 키가 없으면 스킵
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log('VAPID keys not configured, skipping web push');
    return { success: false, error: 'VAPID keys not configured' };
  }

  try {
    // web-push 라이브러리 동적 임포트
    const webpush = await import('web-push');

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@studycafe.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh_key,
        auth: subscription.auth_key,
      },
    };

    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return { success: true };
  } catch (error: unknown) {
    console.error('Error sending web push:', error);
    // 410 Gone 또는 404 Not Found는 구독이 만료됨
    if (error instanceof Error && 'statusCode' in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        return { success: false, error: 'Subscription expired' };
      }
    }
    return { success: false, error: String(error) };
  }
}

// ============================================
// 채널 분기 알림 발송 (통합)
// ============================================

interface SendNotificationParams {
  studentId: string;
  parentId?: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

// 통합 알림 발송 (채널 자동 분기)
// 학생 → 앱 내 알림 + 웹 푸시
// 학부모 → 카카오톡 알림톡 (연동 시)
export async function sendNotificationToAll(params: SendNotificationParams) {
  const supabase = await createClient();

  // 1. 학생 앱 내 알림 생성
  await createStudentNotification({
    studentId: params.studentId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
  });

  // 2. 학부모 알림 (카카오톡)
  if (params.parentId) {
    // 기존 notifications 테이블에 기록 (카카오 연동 후 발송)
    await supabase
      .from('notifications')
      .insert({
        parent_id: params.parentId,
        student_id: params.studentId,
        type: params.type as 'late' | 'absent' | 'point' | 'schedule',
        message: `${params.title}: ${params.message}`,
        sent_via: 'kakao',
        is_sent: false, // 카카오 연동 후 true로 변경
      });
  }

  return { success: true };
}

// ============================================
// VAPID 키 조회 (클라이언트용)
// ============================================

// VAPID Public Key 조회 (클라이언트에서 푸시 구독 시 필요)
export async function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}
