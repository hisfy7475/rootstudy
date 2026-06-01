'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push';
import { formatDateKST } from '@/lib/utils';
import { getUserScope } from '@/lib/auth/scope';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import type {
  Mentor,
  MentoringApplication,
  MentoringAttachment,
  MentoringSlot,
  MentoringType,
} from '@/types/database';
import { createStudentNotification, createUserNotification } from '@/lib/actions/notification';
export type {
  MentoringSlotWithMentor,
  MentoringApplicationWithDetails,
} from '@/lib/mentoring-utils';
import {
  mentoringSlotStartMs,
  type MentoringSlotWithMentor,
  type MentoringApplicationWithDetails,
} from '@/lib/mentoring-utils';
import {
  ATTACHMENT_FILE_MAX_BYTES,
  ATTACHMENT_IMAGE_MAX_BYTES,
  ATTACHMENT_IMAGE_MIME_TYPES,
  resolveAttachmentFileMime,
  sanitizeAttachmentSegment,
} from '@shared/uploads/attachments';

// 멘토링/클리닉/상담 신청 첨부.
// - mentoring-attachments: 이미지 전용 (DB allowed_mime_types로 4종 화이트리스트, 10MB)
// - mentoring-files: 파일 전용 (PDF·Office·ZIP 등, 20MB, 코드 레이어에서 화이트리스트)
const MENTORING_IMAGES_BUCKET = 'mentoring-attachments';
const MENTORING_FILES_BUCKET = 'mentoring-files';
// 기존 코드 호환용 별칭
const MENTORING_ATTACHMENTS_BUCKET = MENTORING_IMAGES_BUCKET;
const APPLICATION_ATTACHMENT_ALLOWED_TYPES: string[] = [...ATTACHMENT_IMAGE_MIME_TYPES];
const APPLICATION_ATTACHMENT_MAX_SIZE = ATTACHMENT_IMAGE_MAX_BYTES;

function logPostgrestQueryError(scope: string, error: unknown): void {
  if (error == null) return;
  try {
    const keys = Object.getOwnPropertyNames(error);
    const snapshot: Record<string, unknown> = {};
    for (const k of keys) snapshot[k] = (error as Record<string, unknown>)[k];
    console.error(scope, JSON.stringify(snapshot, null, 2));
  } catch {
    console.error(scope, String(error));
  }
}

type AdminBranchContext = {
  userId: string;
  /**
   * 호출자의 home branch_id. 일반 어드민은 본인 지점, 슈퍼관리자는 본인 profile.branch_id
   * 가 있으면 그 값 (없으면 null). mutation 시 row 의 branch_id 로 사용 가능.
   * read 분기는 isSuperAdmin 을 우선 보고 필터를 생략.
   */
  branchId: string | null;
  isSuperAdmin: boolean;
};

async function requireAdminBranch(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AdminBranchContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, branch_id, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.user_type !== 'admin') return null;
  const isSuperAdmin = !!profile.is_super_admin;
  // 슈퍼관리자는 home branch_id 가 비어 있어도 read 가능. 일반 어드민은 미지정 차단.
  if (!isSuperAdmin && !profile.branch_id) return null;
  return {
    userId: user.id,
    branchId: (profile.branch_id as string | null) ?? null,
    isSuperAdmin,
  };
}

/**
 * 요청자(auth user)에게 허용되는 branch_id 집합을 반환한다.
 * admin/student: 본인 1개. parent: 연결 자녀들의 distinct branch UNION.
 */
async function getActorBranchIds(): Promise<string[]> {
  const scope = await getUserScope();
  return scope?.branchIds ?? [];
}

async function canActForStudent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  studentId: string,
  userType: string | undefined,
): Promise<boolean> {
  if (studentId === actorId) return true;
  if (userType !== 'parent') return false;
  const { data } = await supabase
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', actorId)
    .eq('student_id', studentId)
    .maybeSingle();
  return data != null;
}

// 신규 mutation 진입점에서 학생이 활성인지 검증한다.
// canActForStudent 와 짝이 되며, 학부모 본인이 미들웨어로 차단되더라도 학생 측 활성 여부는 별도 검사.
async function isStudentActive(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('withdrawn_at')
    .eq('id', studentId)
    .maybeSingle();
  return !!data && data.withdrawn_at == null;
}

export async function getMentoringSlotsForRange(
  fromYmd: string,
  toYmd: string,
  filters?: { type?: MentoringType; dateYmd?: string },
): Promise<MentoringSlotWithMentor[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const branchIds = await getActorBranchIds();
  if (branchIds.length === 0) return [];

  let q = supabase
    .from('mentoring_slots')
    .select(
      `
      *,
      mentors!inner ( id, name, subject, subjects, headline, profile_image_url, is_active, branch_id )
    `,
    )
    .in('branch_id', branchIds)
    .eq('is_active', true)
    .gte('date', fromYmd)
    .lte('date', toYmd)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (filters?.type) {
    q = q.eq('type', filters.type);
  }
  if (filters?.dateYmd) {
    q = q.eq('date', filters.dateYmd);
  }

  const { data, error } = await q;

  if (error) {
    logPostgrestQueryError('[getMentoringSlotsForRange]', error);
    return [];
  }

  const rows = (data ?? []) as (MentoringSlot & {
    mentors: Pick<
      Mentor,
      | 'id'
      | 'name'
      | 'subject'
      | 'subjects'
      | 'headline'
      | 'profile_image_url'
      | 'is_active'
      | 'branch_id'
    > | null;
  })[];

  const allowedSet = new Set(branchIds);
  return rows
    .filter(
      (r) => r.mentors?.is_active && r.mentors.branch_id && allowedSet.has(r.mentors.branch_id),
    )
    .map(({ mentors: m, ...slot }) => ({
      ...slot,
      mentors: m
        ? {
            id: m.id,
            name: m.name,
            subject: m.subject,
            subjects: m.subjects ?? [],
            headline: m.headline,
            profile_image_url: m.profile_image_url,
          }
        : null,
    })) as MentoringSlotWithMentor[];
}

export async function getMentoringSlotDetail(
  slotId: string,
): Promise<MentoringSlotWithMentor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const branchIds = await getActorBranchIds();
  if (branchIds.length === 0) return null;

  const { data, error } = await supabase
    .from('mentoring_slots')
    .select(
      `
      *,
      mentors ( id, name, subject, subjects, headline, profile_image_url, bio, is_active, branch_id )
    `,
    )
    .eq('id', slotId)
    .in('branch_id', branchIds)
    .maybeSingle();

  if (error || !data) {
    logPostgrestQueryError('[getMentoringSlotDetail]', error);
    return null;
  }

  const row = data as MentoringSlot & {
    mentors: Pick<
      Mentor,
      | 'id'
      | 'name'
      | 'subject'
      | 'subjects'
      | 'headline'
      | 'profile_image_url'
      | 'bio'
      | 'is_active'
      | 'branch_id'
    > | null;
  };

  if (
    !row.is_active ||
    !row.mentors?.is_active ||
    !row.mentors.branch_id ||
    !branchIds.includes(row.mentors.branch_id)
  ) {
    return null;
  }

  const { mentors: m, ...slot } = row;
  return {
    ...slot,
    mentors: m
      ? {
          id: m.id,
          name: m.name,
          subject: m.subject,
          subjects: m.subjects ?? [],
          headline: m.headline,
          profile_image_url: m.profile_image_url,
        }
      : null,
  } as MentoringSlotWithMentor;
}

const APPLICATION_CONTENT_MIN = 5;
const APPLICATION_CONTENT_MAX = 2000;
const APPLICATION_ATTACHMENTS_MAX = 3;

export type MentoringApplyInput = {
  content: string;
  selectedSubject?: string | null;
  attachments?: MentoringAttachment[];
};

function sanitizeAttachmentList(
  raw: MentoringAttachment[] | undefined,
  ownerUserId: string,
): { ok: true; list: MentoringAttachment[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > APPLICATION_ATTACHMENTS_MAX) {
    return {
      ok: false,
      error: `첨부는 최대 ${APPLICATION_ATTACHMENTS_MAX}개까지 추가할 수 있습니다.`,
    };
  }
  const IMAGE_PREFIX = `/storage/v1/object/public/${MENTORING_IMAGES_BUCKET}/${ownerUserId}/`;
  const FILE_PREFIX = `/storage/v1/object/public/${MENTORING_FILES_BUCKET}/${ownerUserId}/`;
  const cleaned: MentoringAttachment[] = [];
  for (const a of list) {
    if (!a || typeof a.url !== 'string' || typeof a.name !== 'string') {
      return { ok: false, error: '첨부 정보가 올바르지 않습니다.' };
    }
    let pathname = '';
    try {
      const u = new URL(a.url);
      pathname = u.pathname;
    } catch {
      return { ok: false, error: '첨부 URL이 올바르지 않습니다.' };
    }
    const isImageBucket = pathname.startsWith(IMAGE_PREFIX);
    const isFileBucket = pathname.startsWith(FILE_PREFIX);
    if (!isImageBucket && !isFileBucket) {
      return { ok: false, error: '본인이 업로드한 파일만 첨부할 수 있습니다.' };
    }
    const rawMime = typeof a.mime_type === 'string' ? a.mime_type : '';
    const isImageMime = rawMime.toLowerCase().startsWith('image/');
    // 버킷-MIME 정합성: 이미지 버킷이면 image/*, 파일 버킷이면 non-image (클라이언트 위조 차단)
    if (isImageBucket && !isImageMime) {
      return { ok: false, error: '이미지 첨부의 형식 정보가 올바르지 않습니다.' };
    }
    if (isFileBucket && isImageMime) {
      return { ok: false, error: '파일 첨부의 형식 정보가 올바르지 않습니다.' };
    }
    cleaned.push({
      url: a.url,
      name: String(a.name).slice(0, 200),
      mime_type: rawMime || (isImageBucket ? 'image/jpeg' : 'application/octet-stream'),
      size: Number.isFinite(a.size) ? Number(a.size) : 0,
    });
  }
  return { ok: true, list: cleaned };
}

export async function applyMentoring(
  slotId: string,
  studentId: string,
  input: MentoringApplyInput,
): Promise<{ success?: true; applicationId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .maybeSingle();

  const allowed = await canActForStudent(supabase, user.id, studentId, profile?.user_type);
  if (!allowed) return { error: '신청 권한이 없습니다.' };

  // 퇴원 학생을 대상으로 한 신규 멘토링/클리닉/상담 신청은 차단.
  if (!(await isStudentActive(supabase, studentId))) {
    return { error: '퇴원 처리된 학생은 신규 신청을 진행할 수 없습니다.' };
  }

  const trimmedContent = (input.content ?? '').trim();
  if (trimmedContent.length < APPLICATION_CONTENT_MIN) {
    return { error: `문의 내용을 ${APPLICATION_CONTENT_MIN}자 이상 입력해 주세요.` };
  }
  if (trimmedContent.length > APPLICATION_CONTENT_MAX) {
    return { error: `문의 내용은 ${APPLICATION_CONTENT_MAX}자 이하로 입력해 주세요.` };
  }

  const attCheck = sanitizeAttachmentList(input.attachments, user.id);
  if (!attCheck.ok) return { error: attCheck.error };
  const attachments = attCheck.list;

  // 슬롯 branch는 **대상 학생의 branch**와 일치해야 한다.
  // 학부모 다자녀 다지점 케이스에서 타지점 자녀로 엉뚱한 슬롯을 신청하는 것을 차단.
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', studentId)
    .maybeSingle();

  if (!studentProfile?.branch_id) {
    return { error: '학생의 지점 정보가 없습니다.' };
  }
  const studentBranchId = studentProfile.branch_id as string;

  const { data: slot, error: slotErr } = await supabase
    .from('mentoring_slots')
    .select(
      'id, branch_id, capacity, booked_count, date, start_time, is_active, mentor_id, type, mentors!inner(is_active, subjects)',
    )
    .eq('id', slotId)
    .maybeSingle();

  if (slotErr || !slot) {
    return { error: '슬롯을 찾을 수 없습니다.' };
  }

  const slotRow = slot as {
    id: string;
    branch_id: string;
    capacity: number;
    booked_count: number;
    date: string;
    start_time: string;
    is_active: boolean;
    mentor_id: string;
    type: MentoringType;
    mentors:
      | { is_active: boolean; subjects: string[] | null }
      | { is_active: boolean; subjects: string[] | null }[];
  };

  const mentorJoin = Array.isArray(slotRow.mentors) ? slotRow.mentors[0] : slotRow.mentors;
  const mentorActive = mentorJoin?.is_active;

  if (!slotRow.is_active || !mentorActive || slotRow.branch_id !== studentBranchId) {
    return { error: '신청할 수 없는 슬롯입니다.' };
  }

  // 클리닉이면 selectedSubject가 멘토 subjects에 포함되어야 함
  let normalizedSubject: string | null = null;
  if (slotRow.type === 'clinic') {
    const sel = (input.selectedSubject ?? '').trim();
    if (!sel) return { error: '클리닉 과목을 선택해 주세요.' };
    const mentorSubjects = mentorJoin?.subjects ?? [];
    if (!mentorSubjects.includes(sel)) {
      return { error: '선택한 과목이 멘토의 과목 목록에 없습니다.' };
    }
    normalizedSubject = sel;
  }

  const startMs = mentoringSlotStartMs(slotRow.date, slotRow.start_time);
  if (Date.now() >= startMs) {
    return { error: '이미 시작된 슬롯에는 신청할 수 없습니다.' };
  }

  if (slotRow.booked_count >= slotRow.capacity) {
    return { error: '정원이 마감되었습니다.' };
  }

  const { data: existing } = await supabase
    .from('mentoring_applications')
    .select('id, status')
    .eq('slot_id', slotId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (existing && (existing.status === 'pending' || existing.status === 'confirmed')) {
    return { error: '이미 신청한 슬롯입니다.' };
  }

  const now = new Date().toISOString();
  let applicationId: string;

  if (existing && (existing.status === 'cancelled' || existing.status === 'rejected')) {
    const { error: upErr } = await supabase
      .from('mentoring_applications')
      .update({
        status: 'pending',
        user_id: user.id,
        content: trimmedContent,
        selected_subject: normalizedSubject,
        attachments,
        note: null,
        applied_at: now,
        confirmed_at: null,
        rejected_at: null,
        cancelled_at: null,
        reject_reason: null,
        cancel_reason: null,
        updated_at: now,
      })
      .eq('id', existing.id);

    if (upErr) {
      logPostgrestQueryError('[applyMentoring] re-apply update', upErr);
      return { error: '재신청에 실패했습니다.' };
    }
    applicationId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('mentoring_applications')
      .insert({
        slot_id: slotId,
        user_id: user.id,
        student_id: studentId,
        status: 'pending',
        content: trimmedContent,
        selected_subject: normalizedSubject,
        attachments,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      logPostgrestQueryError('[applyMentoring] insert', insErr);
      return { error: '신청에 실패했습니다.' };
    }
    applicationId = inserted.id as string;
  }

  await notifyBranchAdminsMentoringApplied(studentBranchId, studentId, slotRow.type);

  revalidatePath('/student/mentoring');
  revalidatePath('/student/mentoring/my');
  revalidatePath('/parent/mentoring');
  revalidatePath('/parent/mentoring/my');

  return { success: true, applicationId };
}

export async function cancelMentoringApplication(
  applicationId: string,
  reason: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const trimmed = reason.trim();
  if (!trimmed) return { error: '취소 사유를 입력해 주세요.' };

  const { data: appRow, error: fetchErr } = await supabase
    .from('mentoring_applications')
    .select(
      `
      id,
      user_id,
      student_id,
      status,
      slot_id,
      mentoring_slots!inner ( date, start_time, branch_id )
    `,
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchErr || !appRow) {
    return { error: '신청 내역을 찾을 수 없습니다.' };
  }

  const app = appRow as MentoringApplication & {
    mentoring_slots:
      | { date: string; start_time: string; branch_id: string }
      | { date: string; start_time: string; branch_id: string }[];
  };

  const slotJoin = Array.isArray(app.mentoring_slots)
    ? app.mentoring_slots[0]
    : app.mentoring_slots;

  if (!slotJoin) return { error: '슬롯 정보를 찾을 수 없습니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .maybeSingle();

  const canCancel =
    app.user_id === user.id ||
    app.student_id === user.id ||
    (profile?.user_type === 'parent' &&
      (
        await supabase
          .from('parent_student_links')
          .select('id')
          .eq('parent_id', user.id)
          .eq('student_id', app.student_id)
          .maybeSingle()
      ).data != null);

  if (!canCancel) {
    return { error: '취소 권한이 없습니다.' };
  }

  if (app.status !== 'pending' && app.status !== 'confirmed') {
    return { error: '취소할 수 없는 상태입니다.' };
  }

  const startMs = mentoringSlotStartMs(slotJoin.date, slotJoin.start_time);
  if (Date.now() >= startMs) {
    return { error: '슬롯 시작 후에는 취소할 수 없습니다.' };
  }

  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from('mentoring_applications')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_reason: trimmed,
      updated_at: now,
    })
    .eq('id', applicationId);

  if (upErr) {
    logPostgrestQueryError('[cancelMentoringApplication]', upErr);
    return { error: '취소 처리에 실패했습니다.' };
  }

  revalidatePath('/student/mentoring');
  revalidatePath('/student/mentoring/my');
  revalidatePath('/parent/mentoring');
  revalidatePath('/parent/mentoring/my');

  return { success: true };
}

export async function getMyMentoringApplications(): Promise<MentoringApplicationWithDetails[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .maybeSingle();

  let query = supabase
    .from('mentoring_applications')
    .select(
      `
      *,
      mentoring_slots (
        id,
        date,
        start_time,
        end_time,
        type,
        subject,
        location,
        branch_id,
        mentors ( id, name, subject, subjects, headline, profile_image_url )
      )
    `,
    )
    .order('applied_at', { ascending: false });

  if (profile?.user_type === 'parent') {
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', user.id);

    const childIds = (links ?? []).map((l) => l.student_id);
    if (childIds.length === 0) return [];

    query = query.or(`user_id.eq.${user.id},student_id.in.(${childIds.join(',')})`);
  } else {
    query = query.or(`user_id.eq.${user.id},student_id.eq.${user.id}`);
  }

  const { data, error } = await query;

  if (error) {
    logPostgrestQueryError('[getMyMentoringApplications]', error);
    return [];
  }

  const apps = (data ?? []) as MentoringApplicationWithDetails[];

  const studentIds = [...new Set(apps.map((a) => a.student_id))];
  if (studentIds.length === 0) return [];

  const { data: names } = await supabase.from('profiles').select('id, name').in('id', studentIds);

  const nameById = new Map((names ?? []).map((p) => [p.id, p.name]));

  return apps.map((a) => ({
    ...a,
    student_profile: { name: nameById.get(a.student_id) ?? '' },
  }));
}

async function notifyBranchAdminsMentoringApplied(
  branchId: string,
  studentId: string,
  slotType: MentoringType,
): Promise<void> {
  const admin = createAdminClient();

  const { data: admins, error: aErr } = await admin
    .from('profiles')
    .select('id')
    .eq('branch_id', branchId)
    .eq('user_type', 'admin');

  if (aErr || !admins?.length) {
    if (aErr) console.error('[notifyBranchAdminsMentoringApplied]', aErr);
    return;
  }

  const { data: studentProfile } = await admin
    .from('profiles')
    .select('name')
    .eq('id', studentId)
    .maybeSingle();
  const studentName = studentProfile?.name ?? '학생';

  const typeLabel = MENTORING_TYPE_LABEL[slotType];
  const title = `${typeLabel} 신청 접수`;
  const message = `${studentName}님의 ${typeLabel} 신청이 접수되었습니다.`;
  const link = '/admin/mentoring';

  for (const ad of admins) {
    try {
      await admin.from('user_notifications').insert({
        user_id: ad.id,
        type: 'system',
        title,
        message,
        link,
      });
    } catch (e) {
      console.error('[notifyBranchAdminsMentoringApplied] insert notification', e);
    }
    void sendPushToUser(ad.id, title, message, { path: link }).catch((e) =>
      console.error('[notifyBranchAdminsMentoringApplied] push', e),
    );
  }
}

// ─── Phase 8: 관리자 멘토링 ─────────────────────────────────────────

export type MentorAdminInput = {
  name: string;
  subject?: string | null;
  subjects?: string[];
  headline?: string | null;
  bio?: string | null;
  profile_image_url?: string | null;
  is_active?: boolean;
};

export type MentoringSlotAdminInput = {
  mentor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  type: MentoringType;
  subject?: string | null;
  capacity: number;
  location?: string | null;
  note?: string | null;
  is_active?: boolean;
};

function normalizeTimeForDb(t: string): string {
  const s = t.trim();
  if (s.length >= 8) return s.slice(0, 8);
  if (s.length === 5) return `${s}:00`;
  return s;
}

function timeOrderOk(start: string, end: string): boolean {
  return normalizeTimeForDb(start) < normalizeTimeForDb(end);
}

export type AdminMentoringApplicationRow = MentoringApplication & {
  mentoring_slots:
    | (MentoringSlot & {
        mentors: Pick<
          Mentor,
          'id' | 'name' | 'subject' | 'subjects' | 'headline' | 'profile_image_url'
        > | null;
      })
    | null;
  student_name: string;
  applicant_name: string;
  /** 학생(응시자)이 퇴원 처리된 시각. 어드민 화면에서 [퇴원] 배지 노출용. */
  student_withdrawn_at: string | null;
  /** 신청자(학부모/학생)가 퇴원 처리된 시각. */
  applicant_withdrawn_at: string | null;
  /** 상담/멘토링 결과 기록(있으면). 확정 건에 한해 관리자가 작성. */
  result_note: string | null;
};

export type AdminMentoringApplicationFilters = {
  fromDate?: string;
  toDate?: string;
  status?: 'all' | MentoringApplication['status'];
  type?: 'all' | MentoringType;
  studentSearch?: string;
  slotId?: string;
};

async function assertMentorInBranch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mentorId: string,
  ctx: AdminBranchContext,
): Promise<Mentor | null> {
  let q = supabase.from('mentors').select('*').eq('id', mentorId);
  if (!ctx.isSuperAdmin) {
    if (!ctx.branchId) return null;
    q = q.eq('branch_id', ctx.branchId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error('[assertMentorInBranch]', error);
    return null;
  }
  return data as Mentor | null;
}

async function assertSlotInBranch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slotId: string,
  ctx: AdminBranchContext,
): Promise<MentoringSlot | null> {
  let q = supabase.from('mentoring_slots').select('*').eq('id', slotId);
  if (!ctx.isSuperAdmin) {
    if (!ctx.branchId) return null;
    q = q.eq('branch_id', ctx.branchId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error('[assertSlotInBranch]', error);
    return null;
  }
  return data as MentoringSlot | null;
}

/** 관리자: 지점 멘토 목록. 슈퍼관리자는 전 지점. */
export async function getMentorsForAdmin(): Promise<Mentor[]> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return [];

  let q = supabase.from('mentors').select('*');
  if (!ctx.isSuperAdmin && ctx.branchId) q = q.eq('branch_id', ctx.branchId);
  const { data, error } = await q.order('name', { ascending: true });

  if (error) {
    logPostgrestQueryError('[getMentorsForAdmin]', error);
    return [];
  }
  return (data ?? []) as Mentor[];
}

function normalizeSubjects(input: string[] | undefined | null): string[] {
  if (!input) return [];
  const cleaned = input
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0);
  // 중복 제거 (입력 순서 유지)
  return [...new Set(cleaned)];
}

export async function createMentor(
  data: MentorAdminInput,
): Promise<{ data?: Mentor; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const name = data.name.trim();
  if (!name) return { error: '이름을 입력해 주세요.' };

  const subjects = normalizeSubjects(data.subjects);
  const subject = subjects[0] ?? data.subject?.trim() ?? null;

  // 신규 mentor 는 호출자의 home branch_id 로 생성. 슈퍼관리자가 home 지점이 없으면
  // 생성 불가 (UI 에서 target branch 선택 기능은 후속 트랙).
  if (!ctx.branchId) return { error: '지점이 지정되지 않았습니다.' };

  const { data: inserted, error } = await supabase
    .from('mentors')
    .insert({
      branch_id: ctx.branchId,
      name,
      subject,
      subjects,
      headline: data.headline?.trim() || null,
      bio: data.bio?.trim() || null,
      profile_image_url: data.profile_image_url?.trim() || null,
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error || !inserted) {
    logPostgrestQueryError('[createMentor]', error);
    return { error: '멘토 등록에 실패했습니다.' };
  }

  revalidatePath('/admin/mentoring');
  revalidatePath('/admin/mentoring/mentors');
  return { data: inserted as Mentor };
}

export async function updateMentor(
  mentorId: string,
  data: Partial<MentorAdminInput>,
): Promise<{ data?: Mentor; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const existing = await assertMentorInBranch(supabase, mentorId, ctx);
  if (!existing) return { error: '멘토를 찾을 수 없습니다.' };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.subjects !== undefined) {
    const subjects = normalizeSubjects(data.subjects);
    patch.subjects = subjects;
    // 단수 subject는 다중 과목의 head 로 자동 동기화
    patch.subject = subjects[0] ?? null;
  } else if (data.subject !== undefined) {
    patch.subject = data.subject?.trim() || null;
  }
  if (data.headline !== undefined) patch.headline = data.headline?.trim() || null;
  if (data.bio !== undefined) patch.bio = data.bio?.trim() || null;
  if (data.profile_image_url !== undefined) {
    patch.profile_image_url = data.profile_image_url?.trim() || null;
  }
  if (data.is_active !== undefined) patch.is_active = data.is_active;

  if (typeof patch.name === 'string' && !patch.name) {
    return { error: '이름을 입력해 주세요.' };
  }

  let q = supabase.from('mentors').update(patch).eq('id', mentorId);
  if (!ctx.isSuperAdmin && ctx.branchId) q = q.eq('branch_id', ctx.branchId);
  const { data: updated, error } = await q.select().single();

  if (error || !updated) {
    logPostgrestQueryError('[updateMentor]', error);
    return { error: '멘토 수정에 실패했습니다.' };
  }

  revalidatePath('/admin/mentoring');
  revalidatePath('/admin/mentoring/mentors');
  return { data: updated as Mentor };
}

/** 관리자: 기간 내 슬롯 (비활성 포함) */
export async function getAdminMentoringSlotsForRange(
  fromYmd: string,
  toYmd: string,
): Promise<
  (MentoringSlot & {
    mentors: Pick<
      Mentor,
      'id' | 'name' | 'subject' | 'subjects' | 'headline' | 'profile_image_url' | 'is_active'
    > | null;
  })[]
> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return [];

  let slotsQ = supabase
    .from('mentoring_slots')
    .select(
      `
      *,
      mentors ( id, name, subject, subjects, headline, profile_image_url, is_active )
    `,
    )
    .gte('date', fromYmd)
    .lte('date', toYmd);
  if (!ctx.isSuperAdmin && ctx.branchId) slotsQ = slotsQ.eq('branch_id', ctx.branchId);
  const { data, error } = await slotsQ
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    logPostgrestQueryError('[getAdminMentoringSlotsForRange]', error);
    return [];
  }

  return (data ?? []) as (MentoringSlot & {
    mentors: Pick<
      Mentor,
      'id' | 'name' | 'subject' | 'subjects' | 'headline' | 'profile_image_url' | 'is_active'
    > | null;
  })[];
}

export async function getAdminMentoringSlotDetail(slotId: string): Promise<
  | (MentoringSlot & {
      mentors: Mentor | null;
    })
  | null
> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return null;

  let detailQ = supabase
    .from('mentoring_slots')
    .select(
      `
      *,
      mentors ( * )
    `,
    )
    .eq('id', slotId);
  if (!ctx.isSuperAdmin && ctx.branchId) detailQ = detailQ.eq('branch_id', ctx.branchId);
  const { data, error } = await detailQ.maybeSingle();

  if (error || !data) {
    logPostgrestQueryError('[getAdminMentoringSlotDetail]', error);
    return null;
  }

  const row = data as MentoringSlot & { mentors: Mentor | Mentor[] | null };
  const m = Array.isArray(row.mentors) ? row.mentors[0] : row.mentors;
  return { ...row, mentors: m ?? null };
}

export async function getMentoringApplicationsForSlotAdmin(
  slotId: string,
): Promise<AdminMentoringApplicationRow[]> {
  return getAdminMentoringApplications({ slotId });
}

export async function getAdminMentoringApplications(
  filters: AdminMentoringApplicationFilters = {},
): Promise<AdminMentoringApplicationRow[]> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return [];

  let studentIdsFilter: string[] | null = null;
  const qsearch = filters.studentSearch?.trim();
  if (qsearch) {
    // 검색 시 활성 학생만 매칭. 멘토링 신청 이력 자체는 보존되지만,
    // 학생 검색 UI 결과에서는 퇴원생을 노출하지 않는다.
    const { data: profs } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_type', 'student')
      .is('withdrawn_at', null)
      .ilike('name', `%${qsearch}%`);

    studentIdsFilter = (profs ?? []).map((p) => p.id);
    if (studentIdsFilter.length === 0) return [];
  }

  let q = supabase
    .from('mentoring_applications')
    .select(
      `
      *,
      mentoring_slots!inner (
        id,
        branch_id,
        date,
        start_time,
        end_time,
        type,
        subject,
        location,
        mentors ( id, name, subject, subjects, headline, profile_image_url )
      ),
      mentoring_results ( result_note )
    `,
    )
    .order('applied_at', { ascending: false });
  if (!ctx.isSuperAdmin && ctx.branchId) {
    q = q.eq('mentoring_slots.branch_id', ctx.branchId);
  }

  if (filters.fromDate) {
    q = q.gte('mentoring_slots.date', filters.fromDate);
  }
  if (filters.toDate) {
    q = q.lte('mentoring_slots.date', filters.toDate);
  }
  if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status);
  }
  if (filters.type && filters.type !== 'all') {
    q = q.eq('mentoring_slots.type', filters.type);
  }
  if (filters.slotId) {
    q = q.eq('slot_id', filters.slotId);
  }
  if (studentIdsFilter) {
    q = q.in('student_id', studentIdsFilter);
  }

  const { data, error } = await q;

  if (error) {
    logPostgrestQueryError('[getAdminMentoringApplications]', error);
    return [];
  }

  const apps = (data ?? []) as (MentoringApplication & {
    mentoring_slots:
      | (MentoringSlot & {
          mentors: Pick<
            Mentor,
            'id' | 'name' | 'subject' | 'subjects' | 'headline' | 'profile_image_url'
          > | null;
        })
      | (MentoringSlot & {
          mentors: Pick<
            Mentor,
            'id' | 'name' | 'subject' | 'subjects' | 'headline' | 'profile_image_url'
          > | null;
        })[];
    mentoring_results: { result_note: string } | { result_note: string }[] | null;
  })[];

  const userIds = [...new Set(apps.flatMap((a) => [a.user_id, a.student_id]))];
  const { data: names } = await supabase
    .from('profiles')
    .select('id, name, withdrawn_at')
    .in('id', userIds);

  const nameById = new Map((names ?? []).map((p) => [p.id, p.name ?? '']));
  const withdrawnById = new Map(
    (names ?? []).map((p) => [p.id, (p as { withdrawn_at: string | null }).withdrawn_at]),
  );

  return apps.map((a) => {
    const slotJoin = Array.isArray(a.mentoring_slots) ? a.mentoring_slots[0] : a.mentoring_slots;
    const resultJoin = Array.isArray(a.mentoring_results)
      ? a.mentoring_results[0]
      : a.mentoring_results;
    return {
      ...a,
      mentoring_slots: slotJoin ?? null,
      student_name: nameById.get(a.student_id) ?? '',
      applicant_name: nameById.get(a.user_id) ?? '',
      student_withdrawn_at: withdrawnById.get(a.student_id) ?? null,
      applicant_withdrawn_at: withdrawnById.get(a.user_id) ?? null,
      result_note: resultJoin?.result_note ?? null,
    };
  });
}

export async function createMentoringSlot(
  data: MentoringSlotAdminInput,
): Promise<{ data?: MentoringSlot; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const mentor = await assertMentorInBranch(supabase, data.mentor_id, ctx);
  if (!mentor) return { error: '멘토를 찾을 수 없습니다.' };

  const st = normalizeTimeForDb(data.start_time);
  const et = normalizeTimeForDb(data.end_time);
  if (!timeOrderOk(st, et)) return { error: '종료 시간이 시작 시간보다 커야 합니다.' };

  if (data.capacity < 1) return { error: '정원은 1 이상이어야 합니다.' };

  // 슬롯은 mentor 의 branch_id 를 따라가도록 — 슈퍼관리자가 다른 지점 mentor 에게 슬롯
  // 추가하는 것을 허용하기 위해 mentor.branch_id 를 우선 사용. 일반 어드민은 어차피
  // 본인 branch mentor 만 통과되므로 결과 동일.
  const slotBranchId = (mentor as Mentor).branch_id ?? ctx.branchId;
  if (!slotBranchId) return { error: '지점이 지정되지 않았습니다.' };

  const { data: inserted, error } = await supabase
    .from('mentoring_slots')
    .insert({
      branch_id: slotBranchId,
      mentor_id: data.mentor_id,
      date: data.date,
      start_time: st,
      end_time: et,
      type: data.type,
      subject: data.subject?.trim() || null,
      capacity: data.capacity,
      location: data.location?.trim() || null,
      note: data.note?.trim() || null,
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error || !inserted) {
    logPostgrestQueryError('[createMentoringSlot]', error);
    return { error: '슬롯 등록에 실패했습니다.' };
  }

  revalidateMentoringAdmin();
  return { data: inserted as MentoringSlot };
}

export type MentoringSlotsBulkInput = {
  mentor_id: string;
  /** 해당 주의 월요일 YYYY-MM-DD */
  weekStartMonday: string;
  /** 반복 주 수 (1 이상) */
  repeatWeeks: number;
  /** 1=월 … 7=일 */
  weekdays: number[];
  start_time: string;
  end_time: string;
  type: MentoringType;
  subject?: string | null;
  capacity: number;
  location?: string | null;
  note?: string | null;
};

export async function createMentoringSlotsBulk(
  input: MentoringSlotsBulkInput,
): Promise<{ created: number; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { created: 0, error: '권한이 없습니다.' };

  const mentor = await assertMentorInBranch(supabase, input.mentor_id, ctx);
  if (!mentor) return { created: 0, error: '멘토를 찾을 수 없습니다.' };

  const st = normalizeTimeForDb(input.start_time);
  const et = normalizeTimeForDb(input.end_time);
  if (!timeOrderOk(st, et)) return { created: 0, error: '종료 시간이 시작 시간보다 커야 합니다.' };

  if (input.capacity < 1) return { created: 0, error: '정원은 1 이상이어야 합니다.' };

  const weeks = Math.min(Math.max(1, input.repeatWeeks), 52);
  const weekdays = [...new Set(input.weekdays.filter((d) => d >= 1 && d <= 7))];
  if (weekdays.length === 0) return { created: 0, error: '요일을 선택해 주세요.' };

  const monday = new Date(`${input.weekStartMonday.split('T')[0]}T12:00:00+09:00`);

  const rows: MentoringSlotAdminInput[] = [];
  for (let w = 0; w < weeks; w++) {
    for (const wd of weekdays) {
      const offsetDays = wd - 1 + w * 7;
      const d = new Date(monday.getTime() + offsetDays * 86400000);
      const dateStr = formatDateKST(d);
      rows.push({
        mentor_id: input.mentor_id,
        date: dateStr,
        start_time: st,
        end_time: et,
        type: input.type,
        subject: input.subject,
        capacity: input.capacity,
        location: input.location,
        note: input.note,
      });
    }
  }

  // 멘토의 branch_id 를 슬롯 branch 로 사용. (슈퍼관리자가 다른 지점 mentor 에게 슬롯 일괄 등록 허용)
  const slotBranchId = (mentor as Mentor).branch_id ?? ctx.branchId;
  if (!slotBranchId) return { created: 0, error: '지점이 지정되지 않았습니다.' };
  const payload = rows.map((r) => ({
    branch_id: slotBranchId,
    mentor_id: r.mentor_id,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    type: r.type,
    subject: r.subject?.trim() || null,
    capacity: r.capacity,
    location: r.location?.trim() || null,
    note: r.note?.trim() || null,
    is_active: true,
  }));

  const { data: inserted, error } = await supabase
    .from('mentoring_slots')
    .insert(payload)
    .select('id');

  if (error) {
    logPostgrestQueryError('[createMentoringSlotsBulk]', error);
    return { created: 0, error: '벌크 등록에 실패했습니다. (중복 일정이 있는지 확인하세요)' };
  }

  revalidateMentoringAdmin();
  return { created: (inserted ?? []).length };
}

export async function updateMentoringSlot(
  slotId: string,
  data: Partial<MentoringSlotAdminInput>,
): Promise<{ data?: MentoringSlot; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const existing = await assertSlotInBranch(supabase, slotId, ctx);
  if (!existing) return { error: '슬롯을 찾을 수 없습니다.' };

  if (data.mentor_id) {
    const m = await assertMentorInBranch(supabase, data.mentor_id, ctx);
    if (!m) return { error: '멘토를 찾을 수 없습니다.' };
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (data.mentor_id !== undefined) patch.mentor_id = data.mentor_id;
  if (data.date !== undefined) patch.date = data.date;
  if (data.start_time !== undefined) patch.start_time = normalizeTimeForDb(data.start_time);
  if (data.end_time !== undefined) patch.end_time = normalizeTimeForDb(data.end_time);
  if (data.type !== undefined) patch.type = data.type;
  if (data.subject !== undefined) patch.subject = data.subject?.trim() || null;
  if (data.capacity !== undefined) {
    if (data.capacity < 1) return { error: '정원은 1 이상이어야 합니다.' };
    if (data.capacity < existing.booked_count) {
      return { error: `정원은 현재 신청 인원(${existing.booked_count}) 이상이어야 합니다.` };
    }
    patch.capacity = data.capacity;
  }
  if (data.location !== undefined) patch.location = data.location?.trim() || null;
  if (data.note !== undefined) patch.note = data.note?.trim() || null;
  if (data.is_active !== undefined) patch.is_active = data.is_active;

  const st = (patch.start_time as string | undefined) ?? existing.start_time;
  const et = (patch.end_time as string | undefined) ?? existing.end_time;
  if (!timeOrderOk(String(st), String(et))) {
    return { error: '종료 시간이 시작 시간보다 커야 합니다.' };
  }

  let updateQ = supabase.from('mentoring_slots').update(patch).eq('id', slotId);
  if (!ctx.isSuperAdmin && ctx.branchId) updateQ = updateQ.eq('branch_id', ctx.branchId);
  const { data: updated, error } = await updateQ.select().single();

  if (error || !updated) {
    logPostgrestQueryError('[updateMentoringSlot]', error);
    return { error: '슬롯 수정에 실패했습니다.' };
  }

  revalidateMentoringAdmin();
  return { data: updated as MentoringSlot };
}

export async function deleteMentoringSlot(
  slotId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const existing = await assertSlotInBranch(supabase, slotId, ctx);
  if (!existing) return { error: '슬롯을 찾을 수 없습니다.' };

  const { count, error: cErr } = await supabase
    .from('mentoring_applications')
    .select('id', { count: 'exact', head: true })
    .eq('slot_id', slotId);

  if (cErr) {
    console.error('[deleteMentoringSlot] count', cErr);
    return { error: '신청 내역을 확인할 수 없습니다.' };
  }
  if ((count ?? 0) > 0) {
    return { error: '신청 내역이 있는 슬롯은 삭제할 수 없습니다.' };
  }

  let delQ = supabase.from('mentoring_slots').delete().eq('id', slotId);
  if (!ctx.isSuperAdmin && ctx.branchId) delQ = delQ.eq('branch_id', ctx.branchId);
  const { error } = await delQ;

  if (error) {
    logPostgrestQueryError('[deleteMentoringSlot]', error);
    return { error: '슬롯 삭제에 실패했습니다.' };
  }

  revalidateMentoringAdmin();
  return { success: true };
}

// ─── Mentor profile image ─────────────────────────────────────────

const MENTOR_IMAGES_BUCKET = 'mentor-images';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'JPG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.';
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return '이미지 크기는 5MB 이하여야 합니다.';
  }
  return null;
}

function sanitizeFileName(name: string): string {
  // Supabase Storage key validator는 ASCII 안전 문자만 허용한다.
  // 한글·이모지 등 비-ASCII가 들어오면 'Invalid key'로 업로드가 실패하므로 모두 _로 치환.
  const dot = name.lastIndexOf('.');
  const rawBase = dot > 0 ? name.slice(0, dot) : name;
  const rawExt = dot > 0 ? name.slice(dot) : '';
  const base =
    rawBase
      .replace(/[/\\]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 180) || 'file';
  const ext = rawExt.replace(/[^A-Za-z0-9.]/g, '').slice(0, 20);
  return `${base}${ext}`;
}

function mentorImagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${MENTOR_IMAGES_BUCKET}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  const rest = publicUrl.slice(i + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

export async function uploadMentorProfileImage(
  mentorId: string,
  formData: FormData,
): Promise<{ data?: { url: string }; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const mentor = await assertMentorInBranch(supabase, mentorId, ctx);
  if (!mentor) return { error: '멘토를 찾을 수 없습니다.' };

  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일을 선택해 주세요.' };

  const validationErr = validateImageFile(file);
  if (validationErr) return { error: validationErr };

  if (mentor.profile_image_url) {
    const oldPath = mentorImagePathFromPublicUrl(mentor.profile_image_url);
    if (oldPath) {
      await supabase.storage.from(MENTOR_IMAGES_BUCKET).remove([oldPath]);
    }
  }

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${ctx.userId}/mentors/${mentorId}/${Date.now()}_${safeName}`;

  const { data: uploaded, error: upErr } = await supabase.storage
    .from(MENTOR_IMAGES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (upErr || !uploaded) {
    console.error('[uploadMentorProfileImage] storage', upErr);
    return { error: '이미지 업로드에 실패했습니다.' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(MENTOR_IMAGES_BUCKET).getPublicUrl(uploaded.path);

  let upQ = supabase
    .from('mentors')
    .update({ profile_image_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', mentorId);
  if (!ctx.isSuperAdmin && ctx.branchId) upQ = upQ.eq('branch_id', ctx.branchId);
  const { error: dbErr } = await upQ;

  if (dbErr) {
    console.error('[uploadMentorProfileImage] db', dbErr);
    return { error: '이미지 정보 저장에 실패했습니다.' };
  }

  revalidatePath('/admin/mentoring');
  revalidatePath('/admin/mentoring/mentors');
  return { data: { url: publicUrl } };
}

export async function deleteMentorProfileImage(
  mentorId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const mentor = await assertMentorInBranch(supabase, mentorId, ctx);
  if (!mentor) return { error: '멘토를 찾을 수 없습니다.' };

  if (mentor.profile_image_url) {
    const oldPath = mentorImagePathFromPublicUrl(mentor.profile_image_url);
    if (oldPath) {
      await supabase.storage.from(MENTOR_IMAGES_BUCKET).remove([oldPath]);
    }
  }

  let delImgQ = supabase
    .from('mentors')
    .update({ profile_image_url: null, updated_at: new Date().toISOString() })
    .eq('id', mentorId);
  if (!ctx.isSuperAdmin && ctx.branchId) delImgQ = delImgQ.eq('branch_id', ctx.branchId);
  const { error } = await delImgQ;

  if (error) {
    console.error('[deleteMentorProfileImage] db', error);
    return { error: '이미지 삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/mentoring');
  revalidatePath('/admin/mentoring/mentors');
  return { success: true };
}

// ─── 신청 첨부 업로드/삭제 (학생·학부모) ──────────────────────

// 이미지·파일 두 버킷 모두를 인식하여 (bucket, path) 를 추출.
function applicationAttachmentLocateFromPublicUrl(
  publicUrl: string,
): { bucket: string; path: string } | null {
  for (const bucket of [MENTORING_IMAGES_BUCKET, MENTORING_FILES_BUCKET]) {
    const marker = `/object/public/${bucket}/`;
    const i = publicUrl.indexOf(marker);
    if (i === -1) continue;
    const rest = publicUrl.slice(i + marker.length).split('?')[0];
    try {
      return { bucket, path: decodeURIComponent(rest) };
    } catch {
      return null;
    }
  }
  return null;
}

export async function uploadMentoringApplicationAttachment(
  formData: FormData,
): Promise<{ data?: MentoringAttachment; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일을 선택해 주세요.' };

  if (!APPLICATION_ATTACHMENT_ALLOWED_TYPES.includes(file.type)) {
    return { error: 'JPG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.' };
  }
  if (file.size > APPLICATION_ATTACHMENT_MAX_SIZE) {
    return { error: '이미지 크기는 10MB 이하여야 합니다.' };
  }

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${user.id}/applications/${Date.now()}_${safeName}`;

  const { data: uploaded, error: upErr } = await supabase.storage
    .from(MENTORING_ATTACHMENTS_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (upErr || !uploaded) {
    console.error('[uploadMentoringApplicationAttachment] storage', upErr);
    return { error: '이미지 업로드에 실패했습니다.' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(MENTORING_ATTACHMENTS_BUCKET).getPublicUrl(uploaded.path);

  return {
    data: {
      url: publicUrl,
      name: file.name.slice(0, 200),
      mime_type: file.type || 'image/jpeg',
      size: file.size,
    },
  };
}

export async function uploadMentoringApplicationFile(
  formData: FormData,
): Promise<{ data?: MentoringAttachment; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일을 선택해 주세요.' };

  // 위장 이미지 차단: 이미지는 이미지 전용 업로드 함수 사용
  if (file.type && file.type.toLowerCase().startsWith('image/')) {
    return { error: '이미지는 이미지 첨부 버튼을 사용해 주세요.' };
  }

  const resolvedMime = resolveAttachmentFileMime(file.type, file.name);
  if (!resolvedMime) {
    return { error: '지원하지 않는 파일 형식입니다.' };
  }
  if (file.size > ATTACHMENT_FILE_MAX_BYTES) {
    return { error: '파일 크기는 20MB 이하여야 합니다.' };
  }

  const safeBase = sanitizeAttachmentSegment(file.name || 'file');
  const storagePath = `${user.id}/applications/${Date.now()}_${safeBase}`;

  const { data: uploaded, error: upErr } = await supabase.storage
    .from(MENTORING_FILES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: resolvedMime,
    });

  if (upErr || !uploaded) {
    console.error('[uploadMentoringApplicationFile] storage', upErr);
    return { error: '파일 업로드에 실패했습니다.' };
  }

  // 다운로드 시 원본 한글 파일명이 보존되도록 ?download=<원본이름> 강제.
  const downloadName = file.name || safeBase;
  const {
    data: { publicUrl },
  } = supabase.storage
    .from(MENTORING_FILES_BUCKET)
    .getPublicUrl(uploaded.path, { download: downloadName });

  return {
    data: {
      url: publicUrl,
      name: downloadName.slice(0, 200),
      mime_type: resolvedMime,
      size: file.size,
    },
  };
}

export async function removeMentoringApplicationAttachment(
  url: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const located = applicationAttachmentLocateFromPublicUrl(url);
  if (!located) return { error: '첨부 URL을 인식할 수 없습니다.' };

  // RLS 가 자기 폴더만 허용하므로 서버에서도 prefix 검증을 한 번 더
  if (!located.path.startsWith(`${user.id}/`)) {
    return { error: '본인이 업로드한 파일만 삭제할 수 있습니다.' };
  }

  const { error } = await supabase.storage.from(located.bucket).remove([located.path]);
  if (error) {
    console.error('[removeMentoringApplicationAttachment] storage', error);
    return { error: '첨부 삭제에 실패했습니다.' };
  }
  return { success: true };
}

function revalidateMentoringAdmin(): void {
  revalidatePath('/admin/mentoring');
  revalidatePath('/admin/mentoring/applications');
  revalidatePath('/student/mentoring');
  revalidatePath('/student/mentoring/my');
  revalidatePath('/parent/mentoring');
  revalidatePath('/parent/mentoring/my');
}

function formatSlotDateTimeKST(
  dateYmd: string,
  startTime: string,
  endTime: string,
): {
  dateLabel: string;
  timeLabel: string;
} {
  const st = startTime.length >= 5 ? startTime.slice(0, 5) : startTime;
  const et = endTime.length >= 5 ? endTime.slice(0, 5) : endTime;
  const d = new Date(`${dateYmd}T12:00:00+09:00`);
  const dateLabel = d.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  return { dateLabel, timeLabel: `${st}–${et}` };
}

async function notifyStudentAndParentsMentoringDecision(params: {
  studentId: string;
  subjectLabel: string;
  slotType: MentoringType;
  dateYmd: string;
  startTime: string;
  endTime: string;
  kind: 'confirmed' | 'rejected' | 'cancelled';
  rejectReason?: string;
  /** true 이면 in-app 알림 제목을 "관리자가 대신 등록·확정" 뉘앙스로 분기. */
  byAdmin?: boolean;
}): Promise<void> {
  const admin = createAdminClient();
  const { dateLabel, timeLabel } = formatSlotDateTimeKST(
    params.dateYmd,
    params.startTime,
    params.endTime,
  );

  const typeLabel = MENTORING_TYPE_LABEL[params.slotType];
  const title =
    params.kind === 'confirmed'
      ? params.byAdmin
        ? `관리자가 ${typeLabel} 신청을 등록·확정했습니다`
        : `${typeLabel} 신청이 확정되었습니다`
      : params.kind === 'rejected'
        ? `${typeLabel} 신청이 거절되었습니다`
        : `${typeLabel} 일정이 취소되었습니다`;

  const body =
    params.kind === 'confirmed'
      ? `${params.subjectLabel} / ${dateLabel} ${timeLabel}`
      : params.kind === 'rejected'
        ? `${params.subjectLabel} — 사유: ${params.rejectReason ?? '-'}`
        : `${params.subjectLabel} / ${dateLabel} ${timeLabel}`;

  await createStudentNotification({
    studentId: params.studentId,
    type: 'system',
    title,
    message: body,
    link: '/student/mentoring/my',
  }).catch((e) => console.error('[notifyStudentAndParentsMentoringDecision] student notif', e));

  const { data: links } = await admin
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', params.studentId);

  const parentIds = [...new Set((links ?? []).map((l) => l.parent_id))];

  for (const parentId of parentIds) {
    await createUserNotification({
      userId: parentId,
      type: 'system',
      title,
      message: body,
      link: '/parent/mentoring/my',
    }).catch((e) => console.error('[notifyStudentAndParentsMentoringDecision] parent notif', e));
  }
}

export async function confirmMentoringApplication(
  applicationId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const { data: row, error: fetchErr } = await supabase
    .from('mentoring_applications')
    .select(
      `
      *,
      mentoring_slots!inner (
        branch_id,
        date,
        start_time,
        end_time,
        subject,
        type,
        mentors ( name, subject )
      )
    `,
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchErr || !row) return { error: '신청을 찾을 수 없습니다.' };

  type SlotJoin = MentoringSlot & { mentors: Pick<Mentor, 'name' | 'subject'> | null };
  const app = row as MentoringApplication & { mentoring_slots: SlotJoin | SlotJoin[] };
  const slotsRaw = app.mentoring_slots;
  const slotJoin: SlotJoin | undefined = Array.isArray(slotsRaw) ? slotsRaw[0] : slotsRaw;
  if (!slotJoin) return { error: '권한이 없습니다.' };
  if (!ctx.isSuperAdmin && slotJoin.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  if (app.status !== 'pending') return { error: '대기 중인 신청만 확정할 수 있습니다.' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('mentoring_applications')
    .update({
      status: 'confirmed',
      confirmed_at: now,
      updated_at: now,
    })
    .eq('id', applicationId);

  if (error) {
    logPostgrestQueryError('[confirmMentoringApplication]', error);
    return { error: '확정 처리에 실패했습니다.' };
  }

  const subjectLabel =
    slotJoin.subject?.trim() || MENTORING_TYPE_LABEL[slotJoin.type as MentoringType];

  await notifyStudentAndParentsMentoringDecision({
    studentId: app.student_id,
    subjectLabel,
    slotType: slotJoin.type as MentoringType,
    dateYmd: slotJoin.date,
    startTime: slotJoin.start_time,
    endTime: slotJoin.end_time,
    kind: 'confirmed',
  });

  revalidateMentoringAdmin();
  return { success: true };
}

/**
 * 멘토링/상담 결과가 "최초로" 기록될 때 학생·학부모에게 알림(인앱+푸시) 발송.
 * 기존 채팅 전달을 대체 — 결과 내용이 상담 리포트의 "멘토링/상담 기록"으로 노출되므로
 * 알림을 누르면 각자의 리포트 화면으로 이동(딥링크)한다. 수정·재저장 시에는 호출되지 않는다.
 */
async function notifyMentoringResultRecorded(params: {
  studentId: string;
  slotType: MentoringType;
  resultNote: string;
}): Promise<void> {
  const admin = createAdminClient();
  const typeLabel = MENTORING_TYPE_LABEL[params.slotType];
  // "상담 상담 기록..." 같은 중복을 피하려 타입라벨 + "기록"으로 마무리.
  const title = `${typeLabel} 기록이 등록되었습니다`;
  const note = params.resultNote.trim();
  const body = note.length > 200 ? `${note.slice(0, 200)}…` : note;

  await createStudentNotification({
    studentId: params.studentId,
    type: 'system',
    title,
    message: body,
    link: '/student/report',
  }).catch((e) => console.error('[notifyMentoringResultRecorded] student notif', e));

  const { data: links } = await admin
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', params.studentId);

  const parentIds = [...new Set((links ?? []).map((l) => l.parent_id))];

  for (const parentId of parentIds) {
    await createUserNotification({
      userId: parentId,
      type: 'system',
      title,
      message: body,
      link: '/parent/report',
    }).catch((e) => console.error('[notifyMentoringResultRecorded] parent notif', e));
  }
}

/**
 * 상담/멘토링 결과 저장 (관리자 전용). 확정된 신청에만 기록 가능.
 * 결과는 별도 테이블(mentoring_results)에 저장 — application_id 기준 upsert.
 * 최초 기록 시(기존 행 없음) 학생·학부모에게 알림을 발송한다.
 */
export async function saveMentoringResult(
  applicationId: string,
  resultNote: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const trimmed = resultNote.trim();
  if (!trimmed) return { error: '상담 결과 내용을 입력해 주세요.' };

  const { data: row, error: fetchErr } = await supabase
    .from('mentoring_applications')
    .select('id, status, student_id, mentoring_slots!inner ( branch_id, type )')
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchErr || !row) return { error: '신청을 찾을 수 없습니다.' };

  const slotsRaw = (
    row as {
      mentoring_slots: { branch_id: string; type: string } | { branch_id: string; type: string }[];
    }
  ).mentoring_slots;
  const slotJoin = Array.isArray(slotsRaw) ? slotsRaw[0] : slotsRaw;
  if (!slotJoin) return { error: '권한이 없습니다.' };
  if (!ctx.isSuperAdmin && slotJoin.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }
  if (row.status !== 'confirmed') {
    return { error: '확정된 신청에만 결과를 기록할 수 있습니다.' };
  }

  // 최초 기록 여부 판별 — 수정(upsert) 시에는 알림을 보내지 않기 위함.
  const { data: existing } = await supabase
    .from('mentoring_results')
    .select('application_id')
    .eq('application_id', applicationId)
    .maybeSingle();
  const isFirst = !existing;

  const { error } = await supabase.from('mentoring_results').upsert(
    {
      application_id: applicationId,
      result_note: trimmed,
      recorded_by: ctx.userId,
    },
    { onConflict: 'application_id' },
  );

  if (error) {
    logPostgrestQueryError('[saveMentoringResult]', error);
    return { error: '저장에 실패했습니다.' };
  }

  if (isFirst) {
    await notifyMentoringResultRecorded({
      studentId: (row as { student_id: string }).student_id,
      slotType: slotJoin.type as MentoringType,
      resultNote: trimmed,
    }).catch((e) => console.error('[saveMentoringResult] notify', e));
  }

  revalidateMentoringAdmin();
  revalidatePath('/admin/report');
  revalidatePath('/parent/report');
  revalidatePath('/student/report');
  return { success: true };
}

export async function deleteMentoringResult(
  applicationId: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const { data: row } = await supabase
    .from('mentoring_applications')
    .select('id, mentoring_slots!inner ( branch_id )')
    .eq('id', applicationId)
    .maybeSingle();
  if (!row) return { error: '신청을 찾을 수 없습니다.' };
  const slotsRaw = (row as { mentoring_slots: { branch_id: string } | { branch_id: string }[] })
    .mentoring_slots;
  const slotJoin = Array.isArray(slotsRaw) ? slotsRaw[0] : slotsRaw;
  if (!slotJoin) return { error: '권한이 없습니다.' };
  if (!ctx.isSuperAdmin && slotJoin.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  const { error } = await supabase
    .from('mentoring_results')
    .delete()
    .eq('application_id', applicationId);
  if (error) {
    logPostgrestQueryError('[deleteMentoringResult]', error);
    return { error: '삭제에 실패했습니다.' };
  }

  revalidateMentoringAdmin();
  revalidatePath('/admin/report');
  return { success: true };
}

export async function rejectMentoringApplication(
  applicationId: string,
  reason: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const trimmed = reason.trim();
  if (!trimmed) return { error: '거절 사유를 입력해 주세요.' };

  const { data: row, error: fetchErr } = await supabase
    .from('mentoring_applications')
    .select(
      `
      *,
      mentoring_slots!inner (
        branch_id,
        date,
        start_time,
        end_time,
        subject,
        type,
        mentors ( name, subject )
      )
    `,
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchErr || !row) return { error: '신청을 찾을 수 없습니다.' };

  type SlotJoinR = MentoringSlot & { mentors: Pick<Mentor, 'name' | 'subject'> | null };
  const app = row as MentoringApplication & { mentoring_slots: SlotJoinR | SlotJoinR[] };
  const slotsRawR = app.mentoring_slots;
  const slotJoin: SlotJoinR | undefined = Array.isArray(slotsRawR) ? slotsRawR[0] : slotsRawR;
  if (!slotJoin) return { error: '권한이 없습니다.' };
  if (!ctx.isSuperAdmin && slotJoin.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  if (app.status !== 'pending') return { error: '대기 중인 신청만 거절할 수 있습니다.' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('mentoring_applications')
    .update({
      status: 'rejected',
      rejected_at: now,
      reject_reason: trimmed,
      updated_at: now,
    })
    .eq('id', applicationId);

  if (error) {
    logPostgrestQueryError('[rejectMentoringApplication]', error);
    return { error: '거절 처리에 실패했습니다.' };
  }

  const subjectLabel =
    slotJoin.subject?.trim() || MENTORING_TYPE_LABEL[slotJoin.type as MentoringType];

  await notifyStudentAndParentsMentoringDecision({
    studentId: app.student_id,
    subjectLabel,
    slotType: slotJoin.type as MentoringType,
    dateYmd: slotJoin.date,
    startTime: slotJoin.start_time,
    endTime: slotJoin.end_time,
    kind: 'rejected',
    rejectReason: trimmed,
  });

  revalidateMentoringAdmin();
  return { success: true };
}

export async function adminCancelMentoringApplication(
  applicationId: string,
  reason: string,
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const trimmed = reason.trim();
  if (!trimmed) return { error: '취소 사유를 입력해 주세요.' };

  const { data: row, error: fetchErr } = await supabase
    .from('mentoring_applications')
    .select(
      `
      *,
      mentoring_slots!inner (
        branch_id,
        date,
        start_time,
        end_time,
        subject,
        type
      )
    `,
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchErr || !row) return { error: '신청을 찾을 수 없습니다.' };

  const app = row as MentoringApplication & {
    mentoring_slots: MentoringSlot | MentoringSlot[];
  };
  const slotJoin = Array.isArray(app.mentoring_slots)
    ? app.mentoring_slots[0]
    : app.mentoring_slots;
  if (!slotJoin) return { error: '권한이 없습니다.' };
  if (!ctx.isSuperAdmin && slotJoin.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  if (app.status !== 'pending' && app.status !== 'confirmed') {
    return { error: '취소할 수 없는 상태입니다.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('mentoring_applications')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_reason: trimmed,
      updated_at: now,
    })
    .eq('id', applicationId);

  if (error) {
    logPostgrestQueryError('[adminCancelMentoringApplication]', error);
    return { error: '취소 처리에 실패했습니다.' };
  }

  const subjectLabel =
    slotJoin.subject?.trim() || MENTORING_TYPE_LABEL[slotJoin.type as MentoringType];

  await notifyStudentAndParentsMentoringDecision({
    studentId: app.student_id,
    subjectLabel,
    slotType: slotJoin.type as MentoringType,
    dateYmd: slotJoin.date,
    startTime: slotJoin.start_time,
    endTime: slotJoin.end_time,
    kind: 'cancelled',
    rejectReason: trimmed,
  });

  revalidateMentoringAdmin();
  return { success: true };
}

// 어드민이 학생을 대신해 슬롯에 신청한다. 즉시 confirmed 로 들어간다.
// 권한 검증은 일반 client + requireAdminBranch 로 수행하고,
// mutation 은 service-role 로 분리한다(다른 admin mutation 들과 일관).
export async function adminApplyMentoring(
  slotId: string,
  studentId: string,
  input: { content?: string | null; selectedSubject?: string | null },
): Promise<{ success?: true; applicationId?: string; error?: string }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return { error: '권한이 없습니다.' };

  const { data: slot, error: slotErr } = await supabase
    .from('mentoring_slots')
    .select(
      'id, branch_id, capacity, booked_count, date, start_time, end_time, subject, is_active, mentor_id, type, mentors!inner(is_active, subjects)',
    )
    .eq('id', slotId)
    .maybeSingle();

  if (slotErr || !slot) return { error: '슬롯을 찾을 수 없습니다.' };

  const slotRow = slot as {
    id: string;
    branch_id: string;
    capacity: number;
    booked_count: number;
    date: string;
    start_time: string;
    end_time: string;
    subject: string | null;
    is_active: boolean;
    mentor_id: string;
    type: MentoringType;
    mentors:
      | { is_active: boolean; subjects: string[] | null }
      | { is_active: boolean; subjects: string[] | null }[];
  };

  const mentorJoin = Array.isArray(slotRow.mentors) ? slotRow.mentors[0] : slotRow.mentors;

  if (!slotRow.is_active || !mentorJoin?.is_active) {
    return { error: '신청할 수 없는 슬롯입니다.' };
  }

  if (!ctx.isSuperAdmin && slotRow.branch_id !== ctx.branchId) {
    return { error: '권한이 없습니다.' };
  }

  const startMs = mentoringSlotStartMs(slotRow.date, slotRow.start_time);
  if (Date.now() >= startMs) {
    return { error: '이미 시작된 슬롯에는 신청할 수 없습니다.' };
  }

  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('id, branch_id, user_type, withdrawn_at')
    .eq('id', studentId)
    .maybeSingle();

  if (!studentProfile) return { error: '학생을 찾을 수 없습니다.' };
  if (studentProfile.user_type !== 'student') return { error: '학생 계정이 아닙니다.' };
  if (studentProfile.withdrawn_at != null) {
    return { error: '퇴원 처리된 학생은 신규 신청을 진행할 수 없습니다.' };
  }
  if (!studentProfile.branch_id || studentProfile.branch_id !== slotRow.branch_id) {
    return { error: '학생과 슬롯의 지점이 일치하지 않습니다.' };
  }

  let normalizedSubject: string | null = null;
  if (slotRow.type === 'clinic') {
    const sel = (input.selectedSubject ?? '').trim();
    if (!sel) return { error: '클리닉 과목을 선택해 주세요.' };
    const mentorSubjects = mentorJoin?.subjects ?? [];
    if (!mentorSubjects.includes(sel)) {
      return { error: '선택한 과목이 멘토의 과목 목록에 없습니다.' };
    }
    normalizedSubject = sel;
  }

  const trimmedContent = (input.content ?? '').trim();
  const finalContent = trimmedContent.length > 0 ? trimmedContent : '[관리자가 대신 등록]';
  if (finalContent.length > APPLICATION_CONTENT_MAX) {
    return { error: `메모는 ${APPLICATION_CONTENT_MAX}자 이하로 입력해 주세요.` };
  }

  const subjectLabel = slotRow.subject?.trim() || MENTORING_TYPE_LABEL[slotRow.type];

  const { data: existing } = await supabase
    .from('mentoring_applications')
    .select('id, status')
    .eq('slot_id', slotId)
    .eq('student_id', studentId)
    .maybeSingle();

  const adminDb = createAdminClient();
  const now = new Date().toISOString();

  if (existing) {
    if (existing.status === 'confirmed') {
      return { error: '이미 확정된 신청이 있습니다.' };
    }
    if (existing.status === 'pending') {
      // pending → confirmed: booked_count 변동 없음 (트리거가 같은 그룹은 건드리지 않음).
      const { error: upErr } = await adminDb
        .from('mentoring_applications')
        .update({
          status: 'confirmed',
          user_id: studentId,
          content: finalContent,
          selected_subject: normalizedSubject,
          confirmed_at: now,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (upErr) {
        logPostgrestQueryError('[adminApplyMentoring] update pending→confirmed', upErr);
        return { error: '신청 처리에 실패했습니다.' };
      }

      await notifyStudentAndParentsMentoringDecision({
        studentId,
        subjectLabel,
        slotType: slotRow.type,
        dateYmd: slotRow.date,
        startTime: slotRow.start_time,
        endTime: slotRow.end_time,
        kind: 'confirmed',
        byAdmin: true,
      });

      revalidateMentoringAdmin();
      return { success: true, applicationId: existing.id };
    }
    // rejected / cancelled → confirmed: 트리거가 booked_count +1 처리 (마이그레이션 보강 후).
    if (slotRow.booked_count >= slotRow.capacity) {
      return { error: '정원이 마감되었습니다.' };
    }
    const { error: upErr } = await adminDb
      .from('mentoring_applications')
      .update({
        status: 'confirmed',
        user_id: studentId,
        content: finalContent,
        selected_subject: normalizedSubject,
        attachments: [],
        note: null,
        applied_at: now,
        confirmed_at: now,
        rejected_at: null,
        cancelled_at: null,
        reject_reason: null,
        cancel_reason: null,
        updated_at: now,
      })
      .eq('id', existing.id);
    if (upErr) {
      logPostgrestQueryError('[adminApplyMentoring] update re-apply', upErr);
      return { error: '재신청 처리에 실패했습니다.' };
    }

    await notifyStudentAndParentsMentoringDecision({
      studentId,
      subjectLabel,
      slotType: slotRow.type,
      dateYmd: slotRow.date,
      startTime: slotRow.start_time,
      endTime: slotRow.end_time,
      kind: 'confirmed',
      byAdmin: true,
    });

    revalidateMentoringAdmin();
    return { success: true, applicationId: existing.id };
  }

  // 신규 INSERT
  if (slotRow.booked_count >= slotRow.capacity) {
    return { error: '정원이 마감되었습니다.' };
  }
  const { data: inserted, error: insErr } = await adminDb
    .from('mentoring_applications')
    .insert({
      slot_id: slotId,
      user_id: studentId,
      student_id: studentId,
      status: 'confirmed',
      content: finalContent,
      selected_subject: normalizedSubject,
      attachments: [],
      applied_at: now,
      confirmed_at: now,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    logPostgrestQueryError('[adminApplyMentoring] insert', insErr);
    return { error: '신청에 실패했습니다.' };
  }

  await notifyStudentAndParentsMentoringDecision({
    studentId,
    subjectLabel,
    slotType: slotRow.type,
    dateYmd: slotRow.date,
    startTime: slotRow.start_time,
    endTime: slotRow.end_time,
    kind: 'confirmed',
    byAdmin: true,
  });

  revalidateMentoringAdmin();
  return { success: true, applicationId: inserted.id as string };
}

// 어드민용 학생 검색 (사이드 패널의 학생 Combobox).
// - 이름 ILIKE 검색 (profiles.name 에 trigram 인덱스 존재: 20260430011500_admin_search_indexes.sql)
// - 일반 어드민: 자기 지점만. 슈퍼관리자: opts.branchId 지정 시 그 지점, 미지정 시 전체.
// - 최소 2글자 미만은 빈 배열.
export async function searchStudentsForAdmin(
  query: string,
  opts?: { branchId?: string | null; limit?: number },
): Promise<
  Array<{
    id: string;
    name: string;
    phone: string | null;
    branch_id: string | null;
    branch_name: string | null;
  }>
> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch(supabase);
  if (!ctx) return [];

  const q = (query ?? '').trim();
  if (q.length < 2) return [];

  const limit = Math.min(50, Math.max(1, opts?.limit ?? 10));

  let branchFilter: string | null = null;
  if (!ctx.isSuperAdmin) {
    branchFilter = ctx.branchId;
  } else if (opts?.branchId) {
    branchFilter = opts.branchId;
  }

  let pq = supabase
    .from('profiles')
    .select('id, name, phone, branch_id, branches:branch_id ( name )')
    .eq('user_type', 'student')
    .is('withdrawn_at', null)
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(limit);

  if (branchFilter) pq = pq.eq('branch_id', branchFilter);

  const { data, error } = await pq;
  if (error) {
    logPostgrestQueryError('[searchStudentsForAdmin]', error);
    return [];
  }

  type Row = {
    id: string;
    name: string;
    phone: string | null;
    branch_id: string | null;
    branches: { name: string } | { name: string }[] | null;
  };

  return (data ?? []).map((row) => {
    const r = row as Row;
    const b = Array.isArray(r.branches) ? r.branches[0] : r.branches;
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      branch_id: r.branch_id,
      branch_name: b?.name ?? null,
    };
  });
}
