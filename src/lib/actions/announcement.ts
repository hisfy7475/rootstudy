'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { createBulkStudentNotifications, createUserNotification } from './notification';
import { getUserScope } from '@/lib/auth/scope';

// ============================================
// 공지사항 조회
// ============================================

export interface AnnouncementAttachmentRow {
  id: string;
  announcement_id: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

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
  attachments?: AnnouncementAttachmentRow[];
}

// 공지사항 목록 조회 (학생/학부모용)
export async function getAnnouncements(limit: number = 50): Promise<AnnouncementWithReadStatus[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const scope = await getUserScope();
  if (!scope) return [];

  // 사용자 타입에 맞는 공지사항 조회
  let query = supabase
    .from('announcements')
    .select(
      `
      *,
      announcement_reads!left(user_id),
      profiles!announcements_created_by_fkey(name)
    `,
    )
    .order('is_important', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // 대상 필터링 (all 또는 사용자 타입)
  if (scope.userType === 'student') {
    query = query.in('target_audience', ['all', 'student']);
  } else if (scope.userType === 'parent') {
    query = query.in('target_audience', ['all', 'parent']);
  }

  // 지점 필터링: scope.branchIds UNION + null(전체공지) 허용
  // parent 다자녀 다지점이면 여러 branch의 합집합을 본다.
  if (scope.branchIds.length > 0) {
    const csv = scope.branchIds.map((id) => `"${id}"`).join(',');
    query = query.or(`branch_id.is.null,branch_id.in.(${csv})`);
  }
  // scope.branchIds 비면 전체(branch_id IS NULL) 공지만 필터 (추가 .or 없이 기본 반환은 전체)
  // 하지만 RLS가 null 공지만 허용할 것 → 안전. 호출자가 빈 결과 기대.

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('announcements')
    .select(
      `
      *,
      announcement_reads!left(user_id),
      profiles!announcements_created_by_fkey(name)
    `,
    )
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error fetching announcement:', error);
    return null;
  }

  const reads = data.announcement_reads || [];
  const isRead = reads.some((read: { user_id: string }) => read.user_id === user.id);

  const { data: attachmentRows } = await supabase
    .from('announcement_attachments')
    .select('*')
    .eq('announcement_id', id)
    .order('created_at', { ascending: true });

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
    attachments: (attachmentRows || []) as AnnouncementAttachmentRow[],
  };
}

// 미확인 공지 수 조회
export async function getUnreadAnnouncementCount(): Promise<number> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const scope = await getUserScope();
  if (!scope) return 0;

  // 전체 공지사항 ID 조회
  let query = supabase.from('announcements').select('id');

  // 대상 필터링
  if (scope.userType === 'student') {
    query = query.in('target_audience', ['all', 'student']);
  } else if (scope.userType === 'parent') {
    query = query.in('target_audience', ['all', 'parent']);
  }

  // 지점 필터링: scope.branchIds UNION + null(전체공지) 허용
  if (scope.branchIds.length > 0) {
    const csv = scope.branchIds.map((id) => `"${id}"`).join(',');
    query = query.or(`branch_id.is.null,branch_id.in.(${csv})`);
  }

  const { data: announcements } = await query;
  if (!announcements || announcements.length === 0) return 0;

  const announcementIds = announcements.map((a) => a.id);

  // 읽은 공지 ID 조회
  const { data: reads } = await supabase
    .from('announcement_reads')
    .select('announcement_id')
    .eq('user_id', user.id)
    .in('announcement_id', announcementIds);

  const readIds = new Set((reads || []).map((r) => r.announcement_id));
  const unreadCount = announcementIds.filter((id) => !readIds.has(id)).length;

  return unreadCount;
}

// ============================================
// 공지사항 읽음 처리
// ============================================

export async function markAnnouncementAsRead(announcementId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // upsert로 중복 방지
  const { error } = await supabase.from('announcement_reads').upsert(
    {
      announcement_id: announcementId,
      user_id: user.id,
      read_at: new Date().toISOString(),
    },
    {
      onConflict: 'announcement_id,user_id',
    },
  );

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

export interface AnnouncementRow {
  id: string;
  branch_id: string | null;
  title: string;
  content: string;
  is_important: boolean;
  target_audience: 'all' | 'student' | 'parent';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  read_count: number;
  creator_name?: string;
}

export interface AnnouncementsListParams {
  branchId: string;
  page: number;
  pageSize: number;
  q?: string;
  sort: 'created_at';
  dir: 'asc' | 'desc';
  audience?: 'all' | 'student' | 'parent';
  important?: boolean;
}

export interface AnnouncementsListResult {
  rows: AnnouncementRow[];
  total: number;
  page: number;
  pageSize: number;
}

// 관리자용 공지사항 목록 — URL 페이지네이션 + branch 필터.
// announcements.branch_id 컬럼은 이미 존재. 명시 필터로 다른 지점 공지 누수 방지.
export async function getAnnouncementsForAdmin(
  params: AnnouncementsListParams,
): Promise<AnnouncementsListResult> {
  const supabase = await createClient();
  const { branchId, page, pageSize, q, sort, dir, audience, important } = params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], total: 0, page: 1, pageSize };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();
  if (!profile || profile.user_type !== 'admin') {
    return { rows: [], total: 0, page: 1, pageSize };
  }

  const from = Math.max(0, (Math.max(1, page) - 1) * pageSize);
  const to = from + pageSize - 1;

  // 명시적 컬럼 프로젝션 (이전: select('*'))
  let query = supabase
    .from('announcements')
    .select(
      `
      id, branch_id, title, content, is_important, target_audience,
      created_by, created_at, updated_at,
      announcement_reads(count),
      profiles!announcements_created_by_fkey(name)
    `,
      { count: 'exact' },
    )
    .eq('branch_id', branchId)
    .order(sort, { ascending: dir === 'asc' })
    .range(from, to);

  if (audience) query = query.eq('target_audience', audience);
  if (important !== undefined) query = query.eq('is_important', important);
  if (q && q.trim()) {
    // PostgREST .or() 는 콤마/괄호를 separator·grouping 으로 해석하므로
    // 검색어 그대로 인터폴레이트하면 다중 filter 로 잘못 파싱된다.
    // 1) quote 안에서 깨지는 메타문자(`\` `"` `(` `)`) 는 제거.
    //    검색 의미 거의 없는 문자라 strip 이 자연스럽다.
    // 2) SQL ILIKE 와일드카드(`%` `_`)는 PG 기본 escape char `\` 로 리터럴화.
    // 3) 값을 큰따옴표로 감싸 separator/grouping 충돌 차단.
    const safe = q
      .trim()
      .replace(/[\\"()]/g, '')
      .replace(/[%_]/g, '\\$&');
    const pattern = `%${safe}%`;
    query = query.or(`title.ilike."${pattern}",content.ilike."${pattern}"`);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error('[getAnnouncementsForAdmin]', error);
    return { rows: [], total: 0, page: 1, pageSize };
  }

  const rows: AnnouncementRow[] = (data || []).map((a) => {
    const profileObj = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
    return {
      id: a.id,
      branch_id: a.branch_id,
      title: a.title,
      content: a.content,
      is_important: a.is_important,
      target_audience: a.target_audience,
      created_by: a.created_by,
      created_at: a.created_at,
      updated_at: a.updated_at,
      read_count: a.announcement_reads?.[0]?.count || 0,
      creator_name: profileObj?.name,
    };
  });

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = total === 0 ? 1 : Math.min(Math.max(1, page), lastPage);
  return { rows, total, page: clampedPage, pageSize };
}

// 공지사항 통계 (페이지네이션과 별도 집계). 자기 branch 한정.
export async function getAnnouncementStatsForAdmin(branchId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { total: 0, important: 0, today: 0, totalReads: 0 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();
  if (!profile || profile.user_type !== 'admin') {
    return { total: 0, important: 0, today: 0, totalReads: 0 };
  }

  const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [totalRes, importantRes, todayRes, readsRes] = await Promise.all([
    supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId),
    supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('is_important', true),
    supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .gte('created_at', `${todayKST}T00:00:00+09:00`),
    supabase
      .from('announcement_reads')
      .select('id, announcements!inner(branch_id)', { count: 'exact', head: true })
      .eq('announcements.branch_id', branchId),
  ]);

  return {
    total: totalRes.count ?? 0,
    important: importantRes.count ?? 0,
    today: todayRes.count ?? 0,
    totalReads: readsRes.count ?? 0,
  };
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    const resolvedBranchIdForNotif =
      params.branchId !== undefined ? params.branchId : profile.branch_id;
    await sendAnnouncementNotifications(
      announcement.id,
      params.title,
      params.targetAudience || 'all',
      resolvedBranchIdForNotif,
    );
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/student/announcements');
  revalidatePath('/parent/announcements');

  return { success: true, data: announcement };
}

// 공지사항 수정
export async function updateAnnouncement(id: string, params: Partial<CreateAnnouncementParams>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const { error } = await supabase.from('announcements').update(updateData).eq('id', id);

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const { error } = await supabase.from('announcements').delete().eq('id', id);

  if (error) {
    console.error('Error deleting announcement:', error);
    return { error: '공지사항 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/student/announcements');
  revalidatePath('/parent/announcements');

  return { success: true };
}

const ANNOUNCEMENT_FILE_MAX_BYTES = 20 * 1024 * 1024;
const ANNOUNCEMENT_ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

function sanitizeAnnouncementFileSegment(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/\s+/g, '_');
  return base.slice(0, 200) || 'file';
}

/** 공지 첨부 목록 (학생/학부모·관리자 공통, RLS) */
export async function getAnnouncementAttachments(
  announcementId: string,
): Promise<AnnouncementAttachmentRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('announcement_attachments')
    .select('*')
    .eq('announcement_id', announcementId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getAnnouncementAttachments]', error);
    return [];
  }
  return (data || []) as AnnouncementAttachmentRow[];
}

/** 관리자: 공지에 파일 첨부 (Storage `announcement-files` + DB) */
export async function uploadAnnouncementAttachment(announcementId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: '관리자만 업로드할 수 있습니다.' };
  }

  const { data: ann, error: annErr } = await supabase
    .from('announcements')
    .select('id')
    .eq('id', announcementId)
    .maybeSingle();

  if (annErr || !ann) {
    return { error: '공지를 찾을 수 없습니다.' };
  }

  const file = formData.get('file') as File;
  if (!file) return { error: '파일이 없습니다.' };

  if (
    !ANNOUNCEMENT_ALLOWED_MIME.includes(file.type as (typeof ANNOUNCEMENT_ALLOWED_MIME)[number])
  ) {
    return { error: '지원하지 않는 파일 형식입니다.' };
  }

  if (file.size > ANNOUNCEMENT_FILE_MAX_BYTES) {
    return { error: '파일 크기는 20MB 이하여야 합니다.' };
  }

  const safeBase = sanitizeAnnouncementFileSegment(file.name);
  const path = `${user.id}/${announcementId}/${Date.now()}_${safeBase}`;

  const { data: uploaded, error: upErr } = await supabase.storage
    .from('announcement-files')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (upErr) {
    console.error('[uploadAnnouncementAttachment] storage', upErr);
    return { error: '파일 업로드에 실패했습니다.' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('announcement-files').getPublicUrl(uploaded.path);

  const { data: row, error: insErr } = await supabase
    .from('announcement_attachments')
    .insert({
      announcement_id: announcementId,
      file_url: publicUrl,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
    })
    .select()
    .single();

  if (insErr) {
    console.error('[uploadAnnouncementAttachment] insert', insErr);
    return { error: '첨부 정보 저장에 실패했습니다.' };
  }

  revalidatePath('/admin/announcements');
  revalidatePath('/student/announcements');
  revalidatePath('/parent/announcements');

  return { data: row as AnnouncementAttachmentRow };
}

function storageObjectPathFromPublicUrl(fileUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const i = fileUrl.indexOf(marker);
  if (i === -1) return null;
  const rest = fileUrl.slice(i + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** 관리자: 첨부 삭제 (Storage 객체 함께 삭제) */
export async function deleteAnnouncementAttachment(attachmentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: '관리자만 삭제할 수 있습니다.' };
  }

  const { data: row, error: fetchErr } = await supabase
    .from('announcement_attachments')
    .select('file_url')
    .eq('id', attachmentId)
    .single();

  if (fetchErr || !row) {
    console.error('[deleteAnnouncementAttachment] fetch', fetchErr);
    return { error: '첨부를 찾을 수 없습니다.' };
  }

  const storagePath = storageObjectPathFromPublicUrl(row.file_url, 'announcement-files');
  if (storagePath) {
    const { error: rmErr } = await supabase.storage
      .from('announcement-files')
      .remove([storagePath]);
    if (rmErr) {
      console.error('[deleteAnnouncementAttachment] storage', rmErr);
    }
  }

  const { error } = await supabase.from('announcement_attachments').delete().eq('id', attachmentId);

  if (error) {
    console.error('[deleteAnnouncementAttachment]', error);
    return { error: '첨부 삭제에 실패했습니다.' };
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
  branchId?: string | null,
) {
  const supabase = await createClient();

  // 대상 사용자 조회 — 퇴원 회원은 발송 대상에서 제외
  let studentQuery = supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'student')
    .is('withdrawn_at', null);

  let parentQuery = supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'parent')
    .is('withdrawn_at', null);

  // 지점 필터링
  if (branchId) {
    studentQuery = studentQuery.eq('branch_id', branchId);
    parentQuery = parentQuery.eq('branch_id', branchId);
  }

  // 학생 알림 발송
  if (targetAudience === 'all' || targetAudience === 'student') {
    const { data: students } = await studentQuery;
    if (students && students.length > 0) {
      const studentIds = students.map((s) => s.id);
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
        parents.map((parent) =>
          createUserNotification({
            userId: parent.id,
            type: 'system',
            title: '새 공지사항',
            message: title,
            link: `/parent/announcements?id=${announcementId}`,
          }),
        ),
      );
    }
  }
}
