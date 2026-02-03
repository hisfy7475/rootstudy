'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { createBulkStudentNotifications, createUserNotification } from './notification';

// ============================================
// 공지사항 조회
// ============================================

export interface AnnouncementWithReadStatus {
  id: string;
  branch_id: string | null;
  title: string;
  content: string;
  is_important: boolean;
  target_audience: 'all' | 'student' | 'parent';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_read: boolean;
  read_count?: number;
  total_target_count?: number;
  creator_name?: string;
}

// 공지사항 목록 조회 (학생/학부모용)
export async function getAnnouncements(limit: number = 50): Promise<AnnouncementWithReadStatus[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // 사용자 프로필 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, branch_id')
    .eq('id', user.id)
    .single();

  if (!profile) return [];

  // 사용자 타입에 맞는 공지사항 조회
  let query = supabase
    .from('announcements')
    .select(`
      *,
      announcement_reads!left(user_id),
      profiles!announcements_created_by_fkey(name)
    `)
    .order('is_important', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // 대상 필터링 (all 또는 사용자 타입)
  if (profile.user_type === 'student') {
    query = query.in('target_audience', ['all', 'student']);
  } else if (profile.user_type === 'parent') {
    query = query.in('target_audience', ['all', 'parent']);
  }

  // 지점 필터링 (null이면 전체 공지, 아니면 해당 지점만)
  if (profile.branch_id) {
    query = query.or(`branch_id.is.null,branch_id.eq.${profile.branch_id}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching announcements:', error);
    return [];
  }

  // 읽음 상태 매핑
  return (data || []).map((announcement) => {
    const reads = announcement.announcement_reads || [];
    const isRead = reads.some((read: { user_id: string }) => read.user_id === user.id);
    
    return {
      id: announcement.id,
      branch_id: announcement.branch_id,
      title: announcement.title,
      content: announcement.content,
      is_important: announcement.is_important,
      target_audience: announcement.target_audience,
      created_by: announcement.created_by,
      created_at: announcement.created_at,
      updated_at: announcement.updated_at,
      is_read: isRead,
      creator_name: announcement.profiles?.name,
    };
  });
}

// 공지사항 상세 조회
export async function getAnnouncementById(id: string): Promise<AnnouncementWithReadStatus | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('announcements')
    .select(`
      *,
      announcement_reads!left(user_id),
      profiles!announcements_created_by_fkey(name)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error fetching announcement:', error);
    return null;
  }

  const reads = data.announcement_reads || [];
  const isRead = reads.some((read: { user_id: string }) => read.user_id === user.id);

  return {
    id: data.id,
    branch_id: data.branch_id,
    title: data.title,
    content: data.content,
    is_important: data.is_important,
    target_audience: data.target_audience,
    created_by: data.created_by,
    created_at: data.created_at,
    updated_at: data.updated_at,
    is_read: isRead,
    creator_name: data.profiles?.name,
  };
}

// 미확인 공지 수 조회
export async function getUnreadAnnouncementCount(): Promise<number> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  // 사용자 프로필 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, branch_id')
    .eq('id', user.id)
    .single();

  if (!profile) return 0;

  // 전체 공지사항 ID 조회
  let query = supabase
    .from('announcements')
    .select('id');

  // 대상 필터링
  if (profile.user_type === 'student') {
    query = query.in('target_audience', ['all', 'student']);
  } else if (profile.user_type === 'parent') {
    query = query.in('target_audience', ['all', 'parent']);
  }

  // 지점 필터링
  if (profile.branch_id) {
    query = query.or(`branch_id.is.null,branch_id.eq.${profile.branch_id}`);
  }

  const { data: announcements } = await query;
  if (!announcements || announcements.length === 0) return 0;

  const announcementIds = announcements.map(a => a.id);

  // 읽은 공지 ID 조회
  const { data: reads } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('user_id', user.id)
    .in('announcement_id', announcementIds);

  const readIds = new Set((reads || []).map(r => r.announcement_id));
  const unreadCount = announcementIds.filter(id => !readIds.has(id)).length;

  return unreadCount;
}

// ============================================
// 공지사항 읽음 처리
// ============================================

export async function markAnnouncementAsRead(announcementId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // upsert로 중복 방지
  const { error } = await supabase
    .from('announcement_reads')
    .upsert({
      announcement_id: announcementId,
      user_id: user.id,
      read_at: new Date().toISOString(),
    }, {
      onConflict: 'announcement_id,user_id',
    });

  if (error) {
    console.error('Error marking announcement as read:', error);
    return { error: '읽음 처리에 실패했습니다.' };
  }

  revalidatePath('/student/announcements');
  revalidatePath('/parent/announcements');
  return { success: true };
}

// ============================================
// 관리자용 공지사항 관리
// ============================================

// 관리자용 공지사항 목록 조회 (읽음 통계 포함)
export async function getAnnouncementsForAdmin(limit: number = 100) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // 관리자 권한 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') return [];

  const { data, error } = await supabase
    .from('announcements')
    .select(`
      *,
      announcement_reads(count),
      profiles!announcements_created_by_fkey(name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching announcements for admin:', error);
    return [];
  }

  return (data || []).map((announcement) => ({
    id: announcement.id,
    branch_id: announcement.branch_id,
    title: announcement.title,
    content: announcement.content,
    is_important: announcement.is_important,
    target_audience: announcement.target_audience,
    created_by: announcement.created_by,
    created_at: announcement.created_at,
    updated_at: announcement.updated_at,
    read_count: announcement.announcement_reads?.[0]?.count || 0,
    creator_name: announcement.profiles?.name,
  }));
}

interface CreateAnnouncementParams {
  title: string;
  content: string;
  isImportant?: boolean;
  targetAudience?: 'all' | 'student' | 'parent';
  branchId?: string | null;
  sendNotification?: boolean;
}

// 공지사항 생성
export async function createAnnouncement(params: CreateAnnouncementParams) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 관리자 권한 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, branch_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: '관리자 권한이 필요합니다.' };
  }

  // 공지사항 생성
  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      title: params.title,
      content: params.content,
      is_important: params.isImportant || false,
      target_audience: params.targetAudience || 'all',
      branch_id: params.branchId !== undefined ? params.branchId : profile.branch_id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating announcement:', error);
    return { error: '공지사항 생성에 실패했습니다.' };
  }

  // 알림 발송 (옵션)
  if (params.sendNotification !== false) {
    await sendAnnouncementNotifications(announcement.id, params.title, params.targetAudience || 'all', params.branchId);
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/student/announcements');
  revalidatePath('/parent/announcements');
  
  return { success: true, data: announcement };
}

// 공지사항 수정
export async function updateAnnouncement(id: string, params: Partial<CreateAnnouncementParams>) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 관리자 권한 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: '관리자 권한이 필요합니다.' };
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.title !== undefined) updateData.title = params.title;
  if (params.content !== undefined) updateData.content = params.content;
  if (params.isImportant !== undefined) updateData.is_important = params.isImportant;
  if (params.targetAudience !== undefined) updateData.target_audience = params.targetAudience;
  if (params.branchId !== undefined) updateData.branch_id = params.branchId;

  const { error } = await supabase
    .from('announcements')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Error updating announcement:', error);
    return { error: '공지사항 수정에 실패했습니다.' };
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/student/announcements');
  revalidatePath('/parent/announcements');
  
  return { success: true };
}

// 공지사항 삭제
export async function deleteAnnouncement(id: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 관리자 권한 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: '관리자 권한이 필요합니다.' };
  }

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting announcement:', error);
    return { error: '공지사항 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/student/announcements');
  revalidatePath('/parent/announcements');
  
  return { success: true };
}

// ============================================
// 알림 발송 (내부 함수)
// ============================================

async function sendAnnouncementNotifications(
  announcementId: string,
  title: string,
  targetAudience: 'all' | 'student' | 'parent',
  branchId?: string | null
) {
  const supabase = await createClient();

  // 대상 사용자 조회
  let studentQuery = supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'student');

  let parentQuery = supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'parent');

  // 지점 필터링
  if (branchId) {
    studentQuery = studentQuery.eq('branch_id', branchId);
    parentQuery = parentQuery.eq('branch_id', branchId);
  }

  // 학생 알림 발송
  if (targetAudience === 'all' || targetAudience === 'student') {
    const { data: students } = await studentQuery;
    if (students && students.length > 0) {
      const studentIds = students.map(s => s.id);
      await createBulkStudentNotifications(studentIds, {
        type: 'system',
        title: '새 공지사항',
        message: title,
        link: `/student/announcements?id=${announcementId}`,
      });
    }
  }

  // 학부모 알림 발송
  if (targetAudience === 'all' || targetAudience === 'parent') {
    const { data: parents } = await parentQuery;
    if (parents && parents.length > 0) {
      await Promise.allSettled(
        parents.map(parent =>
          createUserNotification({
            userId: parent.id,
            type: 'system',
            title: '새 공지사항',
            message: title,
            link: `/parent/announcements?id=${announcementId}`,
          })
        )
      );
    }
  }
}
