'use server';

import { createClient } from '@/lib/supabase/server';
import { sendPushToUser, sendPushToUsers } from '@/lib/push';
import { revalidatePath } from 'next/cache';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import type { MentoringType } from '@/types/database';

/**
 * notifications 테이블 INSERT 시 채울 branch_id 를 학생 또는 학부모에서 도출한다.
 * - studentId 우선: 해당 학생 profiles.branch_id
 * - 폴백: parent_student_links 첫 자녀의 branch_id
 *
 * NOT NULL 컬럼이라 INSERT 전에 반드시 호출해야 한다.
 */
async function resolveNotificationBranchId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: { studentId?: string | null; parentId?: string | null },
): Promise<string | null> {
  if (ids.studentId) {
    const { data } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', ids.studentId)
      .maybeSingle();
    if (data?.branch_id) return data.branch_id;
  }
  if (ids.parentId) {
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', ids.parentId);
    const studentIds = (links ?? []).map((l) => l.student_id as string);
    if (studentIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('branch_id')
        .in('id', studentIds)
        .not('branch_id', 'is', null);
      const first = profs?.[0];
      if (first?.branch_id) return first.branch_id;
    }
  }
  return null;
}

// ============================================
// 학생 알림 관련
// ============================================

// 학생 알림 목록 조회
export async function getStudentNotifications(limit: number = 50) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
export async function createUserNotification(params: CreateUserNotificationParams) {
  const supabase = await createClient();

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
    console.error('Error creating user notification:', error);
    return { error: '알림 생성에 실패했습니다.' };
  }

  void sendPushToUser(
    params.userId,
    params.title,
    params.message,
    pushDataFromLink(params.link),
  ).catch((e) => console.error('[push] createUserNotification', e));

  return { success: true };
}

// 범용 알림 목록 조회
export async function getUserNotifications(limit: number = 50) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

// 범용 읽지 않은 알림 수 조회
export async function getUnreadUserNotificationCount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

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
export async function createStudentNotification(params: CreateNotificationParams) {
  const supabase = await createClient();

  const { error } = await supabase.from('student_notifications').insert({
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

  void sendPushToUser(
    params.studentId,
    params.title,
    params.message,
    pushDataFromLink(params.link),
  ).catch((e) => console.error('[push] createStudentNotification', e));

  return { success: true };
}

// 다수 학생에게 알림 생성
export async function createBulkStudentNotifications(
  studentIds: string[],
  notification: Omit<CreateNotificationParams, 'studentId'>,
) {
  const supabase = await createClient();

  const notifications = studentIds.map((studentId) => ({
    student_id: studentId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
  }));

  const { error } = await supabase.from('student_notifications').insert(notifications);

  if (error) {
    console.error('Error creating bulk notifications:', error);
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
// 학생 → 앱 내 알림
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
    const branchId = await resolveNotificationBranchId(supabase, {
      studentId: params.studentId,
      parentId: params.parentId,
    });
    if (branchId) {
      // 기존 notifications 테이블에 기록 (카카오 연동 후 발송)
      await supabase.from('notifications').insert({
        branch_id: branchId,
        parent_id: params.parentId,
        student_id: params.studentId,
        type: params.type as 'late' | 'absent' | 'point' | 'schedule',
        message: `${params.title}: ${params.message}`,
        sent_via: 'kakao',
        is_sent: false, // 카카오 연동 후 true로 변경
      });
    } else {
      console.warn('[notifications] branch_id 도출 실패, INSERT 스킵', {
        studentId: params.studentId,
        parentId: params.parentId,
      });
    }
  }

  return { success: true };
}

// ============================================
// 카카오 알림톡 발송 (학부모 대상)
// ============================================

import {
  sendBulkAlimtalk,
  analyzeAlimtalkResult,
  isAlimtalkConfigured,
  getAlimtalkConfig,
} from '@/lib/ncloud/alimtalk';

export { isAlimtalkConfigured, getAlimtalkConfig };

interface SendKakaoAlimtalkParams {
  message: string;
  parentIds?: string[]; // 특정 학부모 지정 (없으면 전체)
  branchId?: string; // 지점 필터링
}

interface AlimtalkSendResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
  totalTargetCount: number;
  noPhoneCount: number;
  error?: string;
}

// 학부모들에게 카카오 알림톡 발송
export async function sendKakaoAlimtalkToParents(
  params: SendKakaoAlimtalkParams,
): Promise<AlimtalkSendResult> {
  const supabase = await createClient();

  // 환경변수 검증
  if (!isAlimtalkConfigured()) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      totalTargetCount: 0,
      noPhoneCount: 0,
      error: '알림톡 설정이 완료되지 않았습니다. 환경변수를 확인해주세요.',
    };
  }

  // 관리자 권한 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      totalTargetCount: 0,
      noPhoneCount: 0,
      error: '로그인이 필요합니다.',
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      totalTargetCount: 0,
      noPhoneCount: 0,
      error: '관리자 권한이 필요합니다.',
    };
  }

  // 대상 학부모 조회
  let parentQuery = supabase.from('profiles').select('id, name, phone').eq('user_type', 'parent');

  // 특정 학부모 지정 시
  if (params.parentIds && params.parentIds.length > 0) {
    parentQuery = parentQuery.in('id', params.parentIds);
  }

  // 지점 필터링은 학부모와 연결된 학생의 지점으로 필터링
  if (params.branchId) {
    // 해당 지점 학생과 연결된 학부모만 조회
    const { data: studentLinks } = await supabase
      .from('parent_student_links')
      .select(
        `
        parent_id,
        student_profiles!inner(
          profiles!inner(branch_id)
        )
      `,
      )
      .eq('student_profiles.profiles.branch_id', params.branchId);

    if (studentLinks && studentLinks.length > 0) {
      const parentIdsInBranch = [...new Set(studentLinks.map((link) => link.parent_id))];
      parentQuery = parentQuery.in('id', parentIdsInBranch);
    } else {
      return {
        success: true,
        sentCount: 0,
        failedCount: 0,
        totalTargetCount: 0,
        noPhoneCount: 0,
        error: '해당 지점에 연결된 학부모가 없습니다.',
      };
    }
  }

  const { data: parents, error: parentsError } = await parentQuery;

  if (parentsError) {
    console.error('Error fetching parents:', parentsError);
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      totalTargetCount: 0,
      noPhoneCount: 0,
      error: '학부모 정보 조회에 실패했습니다.',
    };
  }

  if (!parents || parents.length === 0) {
    return {
      success: true,
      sentCount: 0,
      failedCount: 0,
      totalTargetCount: 0,
      noPhoneCount: 0,
      error: '발송 대상 학부모가 없습니다.',
    };
  }

  // 전화번호가 있는 학부모만 필터링
  const parentsWithPhone = parents.filter((p) => p.phone && p.phone.trim() !== '');
  const noPhoneCount = parents.length - parentsWithPhone.length;

  if (parentsWithPhone.length === 0) {
    return {
      success: true,
      sentCount: 0,
      failedCount: 0,
      totalTargetCount: parents.length,
      noPhoneCount,
      error: '전화번호가 등록된 학부모가 없습니다.',
    };
  }

  // 알림톡 메시지 생성 (최대 100건씩 분할)
  const messages = parentsWithPhone.map((parent) => ({
    to: parent.phone!,
    content: params.message,
  }));

  // 100건씩 분할 발송
  const batchSize = 100;
  let totalSent = 0;
  let totalFailed = 0;

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const response = await sendBulkAlimtalk({ messages: batch });
    const result = analyzeAlimtalkResult(response);

    totalSent += result.successCount;
    totalFailed += result.failedCount;

    // 발송 기록 저장 — 각 parent 별로 branch_id 도출
    const batchParents = parentsWithPhone.slice(i, i + batchSize);
    const branchIdsForParents = await Promise.all(
      batchParents.map((parent) => resolveNotificationBranchId(supabase, { parentId: parent.id })),
    );
    const notificationRecords = batchParents
      .map((parent, idx) => {
        const branchId = branchIdsForParents[idx] ?? params.branchId ?? null;
        if (!branchId) return null;
        return {
          branch_id: branchId,
          parent_id: parent.id,
          student_id: null,
          type: 'system' as const,
          message: params.message,
          sent_via: 'kakao' as const,
          is_sent: !result.failedNumbers.includes(batch[idx].to),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (notificationRecords.length > 0) {
      await supabase.from('notifications').insert(notificationRecords);
    }
  }

  return {
    success: totalFailed === 0,
    sentCount: totalSent,
    failedCount: totalFailed,
    totalTargetCount: parents.length,
    noPhoneCount,
  };
}

// 특정 학부모에게 알림톡 발송 (단일)
export async function sendKakaoAlimtalkToParent(params: {
  parentId: string;
  studentId?: string;
  message: string;
  type?: 'late' | 'absent' | 'point' | 'schedule' | 'system';
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // 환경변수 검증
  if (!isAlimtalkConfigured()) {
    return {
      success: false,
      error: '알림톡 설정이 완료되지 않았습니다.',
    };
  }

  // 학부모 전화번호 조회
  const { data: parent, error: parentError } = await supabase
    .from('profiles')
    .select('phone, name')
    .eq('id', params.parentId)
    .single();

  if (parentError || !parent) {
    return {
      success: false,
      error: '학부모 정보를 찾을 수 없습니다.',
    };
  }

  if (!parent.phone || parent.phone.trim() === '') {
    return {
      success: false,
      error: '학부모 전화번호가 등록되지 않았습니다.',
    };
  }

  // 알림톡 발송
  const response = await sendBulkAlimtalk({
    messages: [{ to: parent.phone, content: params.message }],
  });

  const result = analyzeAlimtalkResult(response);

  // 발송 기록 저장
  const branchId = await resolveNotificationBranchId(supabase, {
    studentId: params.studentId,
    parentId: params.parentId,
  });
  if (branchId) {
    await supabase.from('notifications').insert({
      branch_id: branchId,
      parent_id: params.parentId,
      student_id: params.studentId || null,
      type: params.type || 'system',
      message: params.message,
      sent_via: 'kakao',
      is_sent: result.success,
    });
  } else {
    console.warn('[notifications] branch_id 도출 실패, INSERT 스킵', {
      parentId: params.parentId,
      studentId: params.studentId,
    });
  }

  return {
    success: result.success,
    error: result.success ? undefined : response.error,
  };
}

/**
 * 멘토링/클리닉/상담 전용 알림톡.
 * 템플릿은 (slotType, kind) 조합으로 분기하며, 신규 유형 템플릿이 등록되지 않은 환경에서는
 * 기존 mentoring 템플릿으로 폴백한다(라벨 불일치는 남지만 발송 자체는 보존).
 */
const MENTORING_ALIMTALK_TEMPLATE_ENV = {
  mentoring: {
    confirmed: 'NCLOUD_KAKAO_MENTORING_CONFIRMED_TEMPLATE',
    rejected: 'NCLOUD_KAKAO_MENTORING_REJECTED_TEMPLATE',
    cancelled: 'NCLOUD_KAKAO_MENTORING_CANCELLED_TEMPLATE',
  },
  clinic: {
    confirmed: 'NCLOUD_KAKAO_CLINIC_CONFIRMED_TEMPLATE',
    rejected: 'NCLOUD_KAKAO_CLINIC_REJECTED_TEMPLATE',
    cancelled: 'NCLOUD_KAKAO_CLINIC_CANCELLED_TEMPLATE',
  },
  consult: {
    confirmed: 'NCLOUD_KAKAO_CONSULT_CONFIRMED_TEMPLATE',
    rejected: 'NCLOUD_KAKAO_CONSULT_REJECTED_TEMPLATE',
    cancelled: 'NCLOUD_KAKAO_CONSULT_CANCELLED_TEMPLATE',
  },
} as const satisfies Record<MentoringType, Record<'confirmed' | 'rejected' | 'cancelled', string>>;

export async function sendMentoringAlimtalkToParent(params: {
  parentId: string;
  studentId: string;
  slotType: MentoringType;
  kind: 'confirmed' | 'rejected' | 'cancelled';
  studentName: string;
  subjectLabel: string;
  dateLabel: string;
  timeLabel: string;
  reason?: string;
}): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  if (!isAlimtalkConfigured()) {
    return { success: true, skipped: true };
  }

  const supabase = await createClient();

  const typeSpecific = process.env[MENTORING_ALIMTALK_TEMPLATE_ENV[params.slotType][params.kind]];
  const mentoringFallback = process.env[MENTORING_ALIMTALK_TEMPLATE_ENV.mentoring[params.kind]];
  const templateOverride = typeSpecific || mentoringFallback;

  const { data: parent, error: parentError } = await supabase
    .from('profiles')
    .select('phone, name')
    .eq('id', params.parentId)
    .maybeSingle();

  if (parentError || !parent?.phone?.trim()) {
    return { success: true, skipped: true };
  }

  // 본문 라벨은 실제 슬롯 유형을 따른다. 카카오 템플릿이 mentoring으로 폴백된 경우 본문 검수에서
  // 클리닉/상담 라벨이 불일치로 판정될 수 있으므로, 폴백 시에는 기존 '멘토링' 라벨을 유지.
  const typeLabel = typeSpecific
    ? MENTORING_TYPE_LABEL[params.slotType]
    : MENTORING_TYPE_LABEL.mentoring;
  let content: string;
  if (params.kind === 'confirmed') {
    content = `[${typeLabel} 확정]\n\n${params.studentName}님의 ${params.subjectLabel} ${typeLabel}이(가) 확정되었습니다.\n일시: ${params.dateLabel} ${params.timeLabel}`;
  } else if (params.kind === 'rejected') {
    content = `[${typeLabel} 거절]\n\n${params.studentName}님의 ${params.subjectLabel} ${typeLabel} 신청이 거절되었습니다.\n사유: ${params.reason ?? '-'}`;
  } else {
    content = `[${typeLabel} 취소]\n\n${params.studentName}님의 ${params.subjectLabel} ${typeLabel}이(가) 취소되었습니다.\n일시: ${params.dateLabel} ${params.timeLabel}`;
  }

  const response = await sendBulkAlimtalk({
    messages: [{ to: parent.phone, content }],
    templateCode: templateOverride || undefined,
  });

  const result = analyzeAlimtalkResult(response);

  const branchId = await resolveNotificationBranchId(supabase, {
    studentId: params.studentId,
    parentId: params.parentId,
  });
  if (branchId) {
    await supabase.from('notifications').insert({
      branch_id: branchId,
      parent_id: params.parentId,
      student_id: params.studentId,
      type: 'system',
      message: content,
      sent_via: 'kakao',
      is_sent: result.success,
    });
  } else {
    console.warn('[notifications] branch_id 도출 실패, INSERT 스킵', {
      parentId: params.parentId,
      studentId: params.studentId,
    });
  }

  if (!result.success) {
    return { success: false, error: response.error ?? '알림톡 발송에 실패했습니다.' };
  }

  return { success: true };
}
