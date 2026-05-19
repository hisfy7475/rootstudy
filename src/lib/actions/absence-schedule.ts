'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { revalidatePath } from 'next/cache';
import type { StudentAbsenceSchedule } from '@/types/database';
import {
  formatAbsenceApproverDisplay,
  type AbsenceScheduleListItem,
} from '@/lib/absence-approver-label';
import { ABSENCE_BUFFER_MINUTES } from '@/lib/constants';
import { format, parse, addMinutes, subMinutes, isWithinInterval, getDay } from 'date-fns';

type ApproverProfileRow = { name: string; user_type: 'student' | 'parent' | 'admin' } | null;

function mapRowWithApprover(
  row: StudentAbsenceSchedule & { approver_profile?: ApproverProfileRow },
): AbsenceScheduleListItem {
  const { approver_profile, ...rest } = row;
  const approver_display = formatAbsenceApproverDisplay(
    approver_profile?.name,
    approver_profile?.user_type,
  );
  return { ...rest, approver_display };
}

// 부재 스케줄 목록 조회 (학생용)
export async function getMyAbsenceSchedules(): Promise<AbsenceScheduleListItem[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('student_absence_schedules')
    .select(
      `
      *,
      approver_profile:profiles!student_absence_schedules_approved_by_fkey(name, user_type)
    `,
    )
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching absence schedules:', error);
    return [];
  }

  return (data || []).map((row) =>
    mapRowWithApprover(row as StudentAbsenceSchedule & { approver_profile?: ApproverProfileRow }),
  );
}

// 특정 학생의 부재 스케줄 조회 (관리자/학부모용)
export async function getStudentAbsenceSchedules(
  studentId: string,
): Promise<AbsenceScheduleListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('student_absence_schedules')
    .select(
      `
      *,
      approver_profile:profiles!student_absence_schedules_approved_by_fkey(name, user_type)
    `,
    )
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching student absence schedules:', error);
    return [];
  }

  return (data || []).map((row) =>
    mapRowWithApprover(row as StudentAbsenceSchedule & { approver_profile?: ApproverProfileRow }),
  );
}

// 모든 학생의 부재 스케줄 조회 (관리자용 — URL-first 검색·페이지네이션).
// admin_search_absence_schedules RPC 위임 — title + 학생 이름 OR 검색,
// type/active 필터, 페이지네이션을 한 번에 처리. 권한은 RPC 내부에서 검증.
export async function getAllAbsenceSchedules(params: {
  /** branchId === null 은 슈퍼관리자의 "전 지점" — RPC 내부에서 슈퍼 분기로 통과. */
  branchId: string | null;
  q?: string;
  page?: number;
  pageSize?: number;
  type?: 'recurring' | 'one_time';
  active?: 'active' | 'inactive';
}): Promise<{
  rows: (AbsenceScheduleListItem & { student_name: string; seat_number: number | null })[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 20;

  const { data, error } = await supabase.rpc('admin_search_absence_schedules', {
    p_branch_id: params.branchId,
    p_q: params.q?.trim() || null,
    p_type: params.type ?? null,
    p_active: params.active ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) {
    console.error('Error fetching all absence schedules:', error);
    return { rows: [], total: 0, page, pageSize };
  }

  const rpcRows = (data ?? []) as Array<{
    id: string;
    student_id: string;
    title: string;
    description: string | null;
    is_recurring: boolean;
    recurrence_type: 'weekly' | 'one_time' | null;
    day_of_week: number[] | null;
    start_time: string;
    end_time: string;
    date_type: 'semester' | 'vacation' | 'all' | null;
    valid_from: string | null;
    valid_until: string | null;
    specific_date: string | null;
    buffer_minutes: number;
    is_active: boolean;
    status: 'pending' | 'approved' | 'rejected';
    created_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    rejected_by: string | null;
    rejected_at: string | null;
    created_at: string;
    updated_at: string;
    student_name: string;
    seat_number: number | null;
    approver_name: string | null;
    approver_user_type: 'student' | 'parent' | 'admin' | null;
    total_count: number;
  }>;

  const total = rpcRows[0]?.total_count ?? 0;
  const rows = rpcRows.map((r) => {
    const {
      student_name,
      seat_number,
      approver_name,
      approver_user_type,
      total_count: _total,
      ...rest
    } = r;
    void _total;
    const base = mapRowWithApprover({
      ...(rest as StudentAbsenceSchedule),
      approver_profile:
        approver_name && approver_user_type
          ? { name: approver_name, user_type: approver_user_type }
          : null,
    });
    return {
      ...base,
      student_name: student_name || '알 수 없음',
      seat_number,
    };
  });

  return { rows, total, page, pageSize };
}

// 부재 스케줄 생성 (학생용 - 승인 대기 상태로 생성)
export async function createAbsenceSchedule(data: {
  title: string;
  description?: string;
  is_recurring: boolean;
  recurrence_type?: 'weekly' | 'one_time';
  day_of_week?: number[];
  start_time: string;
  end_time: string;
  date_type?: 'semester' | 'vacation' | 'all';
  valid_from?: string;
  valid_until?: string;
  specific_date?: string;
}): Promise<{ success: boolean; data?: StudentAbsenceSchedule; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: '로그인이 필요합니다.' };
  }

  const { data: newSchedule, error } = await supabase
    .from('student_absence_schedules')
    .insert({
      student_id: user.id,
      title: data.title,
      description: data.description || null,
      is_recurring: data.is_recurring,
      recurrence_type: data.is_recurring ? data.recurrence_type || 'weekly' : 'one_time',
      day_of_week: data.day_of_week || null,
      start_time: data.start_time,
      end_time: data.end_time,
      date_type: data.date_type || 'all',
      valid_from: data.valid_from || null,
      valid_until: data.valid_until || null,
      specific_date: data.is_recurring ? null : data.specific_date,
      buffer_minutes: ABSENCE_BUFFER_MINUTES,
      is_active: true,
      status: 'pending', // 학생이 생성하면 승인 대기
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating absence schedule:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/student/schedule');
  revalidatePath('/parent/schedule');
  revalidatePath('/admin/attendance');
  return { success: true, data: newSchedule };
}

// 관리자용: 특정 학생의 부재 스케줄 생성 (바로 승인됨)
export async function createAbsenceScheduleForStudent(
  studentId: string,
  data: {
    title: string;
    description?: string;
    is_recurring: boolean;
    recurrence_type?: 'weekly' | 'one_time';
    day_of_week?: number[];
    start_time: string;
    end_time: string;
    date_type?: 'semester' | 'vacation' | 'all';
    valid_from?: string;
    valid_until?: string;
    specific_date?: string;
  },
): Promise<{ success: boolean; data?: StudentAbsenceSchedule; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: newSchedule, error } = await supabase
    .from('student_absence_schedules')
    .insert({
      student_id: studentId,
      title: data.title,
      description: data.description || null,
      is_recurring: data.is_recurring,
      recurrence_type: data.is_recurring ? data.recurrence_type || 'weekly' : 'one_time',
      day_of_week: data.day_of_week || null,
      start_time: data.start_time,
      end_time: data.end_time,
      date_type: data.date_type || 'all',
      valid_from: data.valid_from || null,
      valid_until: data.valid_until || null,
      specific_date: data.is_recurring ? null : data.specific_date,
      buffer_minutes: ABSENCE_BUFFER_MINUTES,
      is_active: true,
      status: 'approved', // 관리자가 생성하면 바로 승인
      created_by: user?.id || null,
      approved_by: user?.id || null,
      approved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating absence schedule for student:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/schedules');
  revalidatePath('/student/schedule');
  revalidatePath('/admin/attendance');
  return { success: true, data: newSchedule };
}

// 학부모용: 자녀의 부재 스케줄 생성 (바로 승인됨)
export async function createAbsenceScheduleForChild(
  studentId: string,
  data: {
    title: string;
    description?: string;
    is_recurring: boolean;
    recurrence_type?: 'weekly' | 'one_time';
    day_of_week?: number[];
    start_time: string;
    end_time: string;
    date_type?: 'semester' | 'vacation' | 'all';
    valid_from?: string;
    valid_until?: string;
    specific_date?: string;
  },
): Promise<{ success: boolean; data?: StudentAbsenceSchedule; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: '로그인이 필요합니다.' };
  }

  // 연결된 자녀인지 확인
  const { data: link } = await supabase
    .from('parent_student_links')
    .select('id')
    .eq('parent_id', user.id)
    .eq('student_id', studentId)
    .single();

  if (!link) {
    return { success: false, error: '연결된 자녀가 아닙니다.' };
  }

  // 퇴원 자녀 대상 신규 부재 일정 등록은 차단.
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('withdrawn_at')
    .eq('id', studentId)
    .maybeSingle();
  if (studentProfile?.withdrawn_at) {
    return { success: false, error: '퇴원 처리된 자녀의 부재 일정은 등록할 수 없습니다.' };
  }

  const { data: newSchedule, error } = await supabase
    .from('student_absence_schedules')
    .insert({
      student_id: studentId,
      title: data.title,
      description: data.description || null,
      is_recurring: data.is_recurring,
      recurrence_type: data.is_recurring ? data.recurrence_type || 'weekly' : 'one_time',
      day_of_week: data.day_of_week || null,
      start_time: data.start_time,
      end_time: data.end_time,
      date_type: data.date_type || 'all',
      valid_from: data.valid_from || null,
      valid_until: data.valid_until || null,
      specific_date: data.is_recurring ? null : data.specific_date,
      buffer_minutes: ABSENCE_BUFFER_MINUTES,
      is_active: true,
      status: 'approved', // 학부모가 생성하면 바로 승인
      created_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating absence schedule for child:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/parent/schedule');
  revalidatePath('/student/schedule');
  revalidatePath('/admin/attendance');
  return { success: true, data: newSchedule };
}

// 부재 스케줄 승인 (학부모/관리자용)
export async function approveAbsenceSchedule(
  scheduleId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: '로그인이 필요합니다.' };
  }

  const { error } = await supabase
    .from('student_absence_schedules')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', scheduleId)
    .eq('status', 'pending'); // 대기 중인 것만 승인 가능

  if (error) {
    console.error('Error approving absence schedule:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/parent/schedule');
  revalidatePath('/admin/schedules');
  revalidatePath('/student/schedule');
  revalidatePath('/admin/attendance');
  return { success: true };
}

// 부재 스케줄 거부 (상태 변경)
export async function rejectAbsenceSchedule(
  scheduleId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: '로그인이 필요합니다.' };
  }

  // 대기 중인 스케줄만 거부 가능 (raw SQL로 스키마 캐시 우회)
  const { error } = await supabase.rpc('reject_absence_schedule', {
    p_schedule_id: scheduleId,
    p_rejected_by: user.id,
  });

  if (error) {
    console.error('Error rejecting absence schedule:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/parent/schedule');
  revalidatePath('/admin/schedules');
  revalidatePath('/student/schedule');
  revalidatePath('/admin/attendance');
  return { success: true };
}

// 승인 대기 중인 부재 스케줄 조회 (학부모용 - 연결된 모든 자녀)
export async function getPendingAbsenceSchedulesForParent(): Promise<
  (StudentAbsenceSchedule & { student_name: string })[]
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 연결된 자녀 ID 목록 조회
  const { data: links } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', user.id);

  if (!links || links.length === 0) return [];

  const studentIds = links.map((link) => link.student_id);

  const { data, error } = await supabase
    .from('student_absence_schedules')
    .select(
      `
      *,
      student_profiles!inner(
        profiles!inner(name)
      )
    `,
    )
    .in('student_id', studentIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending absence schedules:', error);
    return [];
  }

  return (data || []).map((schedule) => {
    const studentProfiles = schedule.student_profiles as {
      profiles?: { name?: string } | null;
    } | null;
    return {
      ...schedule,
      student_name: studentProfiles?.profiles?.name || '알 수 없음',
    };
  });
}

// 승인 대기 중인 부재 스케줄 조회 (관리자용 - 모든 학생)
export async function getPendingAbsenceSchedulesForAdmin(
  branchId?: string | null,
): Promise<(StudentAbsenceSchedule & { student_name: string; seat_number?: number | null })[]> {
  const supabase = await createClient();

  let query = supabase
    .from('student_absence_schedules')
    .select(
      `
      *,
      student_profiles!inner(
        seat_number,
        profiles!inner(name, branch_id)
      )
    `,
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (branchId) {
    query = query.eq('student_profiles.profiles.branch_id', branchId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching pending absence schedules for admin:', error);
    return [];
  }

  return (data || []).map((schedule) => {
    const studentProfiles = schedule.student_profiles as {
      seat_number?: number | null;
      profiles?: { name?: string } | null;
    } | null;
    return {
      ...schedule,
      student_name: studentProfiles?.profiles?.name || '알 수 없음',
      seat_number: studentProfiles?.seat_number ?? null,
    };
  });
}

// 부재 스케줄 수정 (학생 본인·학부모·관리자)
export async function updateAbsenceSchedule(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    is_recurring: boolean;
    recurrence_type: 'weekly' | 'one_time';
    day_of_week: number[] | null;
    start_time: string;
    end_time: string;
    date_type: 'semester' | 'vacation' | 'all';
    valid_from: string | null;
    valid_until: string | null;
    specific_date: string | null;
    is_active: boolean;
    status: 'pending' | 'approved' | 'rejected';
  }>,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '로그인이 필요합니다.' };

  // 대상 스케줄 조회 (student_id 확인용)
  const { data: schedule } = await supabase
    .from('student_absence_schedules')
    .select('student_id')
    .eq('id', id)
    .single();

  if (!schedule) return { success: false, error: '스케줄을 찾을 수 없습니다.' };

  // 학생 본인인지 확인
  const isOwner = schedule.student_id === user.id;

  if (!isOwner) {
    // 관리자 또는 연결된 학부모인지 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.user_type === 'admin';

    if (!isAdmin) {
      const { data: parentLink } = await supabase
        .from('parent_student_links')
        .select('id')
        .eq('parent_id', user.id)
        .eq('student_id', schedule.student_id)
        .single();

      if (!parentLink) return { success: false, error: '수정 권한이 없습니다.' };
    }
  }

  const updatePayload: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  if (data.status === 'pending') {
    updatePayload.approved_by = null;
    updatePayload.approved_at = null;
  }

  const { error } = await supabase
    .from('student_absence_schedules')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.error('Error updating absence schedule:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/student/schedule');
  revalidatePath('/parent/schedule');
  revalidatePath('/admin/schedules');
  revalidatePath('/admin/attendance');
  return { success: true };
}

// 부재 스케줄 삭제 (관리자·학부모 전용)
export async function deleteAbsenceSchedule(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '로그인이 필요합니다.' };

  // 대상 스케줄 조회 (student_id 확인용)
  const { data: schedule } = await supabase
    .from('student_absence_schedules')
    .select('student_id')
    .eq('id', id)
    .single();

  if (!schedule) return { success: false, error: '스케줄을 찾을 수 없습니다.' };

  // 학생 본인인지 확인
  const isOwner = schedule.student_id === user.id;

  if (!isOwner) {
    // 관리자 또는 연결된 학부모인지 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.user_type === 'admin';

    if (!isAdmin) {
      const { data: parentLink } = await supabase
        .from('parent_student_links')
        .select('id')
        .eq('parent_id', user.id)
        .eq('student_id', schedule.student_id)
        .single();

      if (!parentLink) return { success: false, error: '삭제 권한이 없습니다.' };
    }
  }

  const adminClient = createAdminClient();
  const { error, count } = await adminClient
    .from('student_absence_schedules')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error('Error deleting absence schedule:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/student/schedule');
  revalidatePath('/parent/schedule');
  revalidatePath('/admin/schedules');
  revalidatePath('/admin/attendance');
  return { success: true };
}

// 부재 스케줄 일괄 삭제 (어드민 전용 — 호출자 지점 학생의 스케줄만 처리)
export async function deleteAbsenceSchedules(
  ids: string[],
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  if (!ids || ids.length === 0) {
    return { success: false, error: '삭제할 일정을 선택해주세요.' };
  }

  const ctx = await requireAdminBranch();
  if (!ctx) return { success: false, error: '삭제 권한이 없습니다.' };

  const supabase = await createClient();

  // student_absence_schedules.student_id → profiles.id. 관계 힌트 의존을 피해 2단계 조회.
  const { data: scheduleRows, error: schedErr } = await supabase
    .from('student_absence_schedules')
    .select('id, student_id')
    .in('id', ids);
  if (schedErr) {
    console.error('Error fetching schedule rows for bulk delete:', schedErr);
    return { success: false, error: schedErr.message };
  }
  const fetched = scheduleRows ?? [];
  if (fetched.length === 0) {
    return { success: false, error: '대상 일정을 찾을 수 없습니다.' };
  }

  let allowedIds: string[];
  if (ctx.branchId === null) {
    // 슈퍼관리자 — 전 지점 통과
    allowedIds = fetched.map((r) => r.id);
  } else {
    const studentIds = Array.from(new Set(fetched.map((r) => r.student_id)));
    const { data: branchStudents, error: profErr } = await supabase
      .from('profiles')
      .select('id')
      .in('id', studentIds)
      .eq('branch_id', ctx.branchId);
    if (profErr) {
      console.error('Error scoping students by branch for bulk delete:', profErr);
      return { success: false, error: profErr.message };
    }
    const allowedStudentSet = new Set((branchStudents ?? []).map((p) => p.id));
    allowedIds = fetched.filter((r) => allowedStudentSet.has(r.student_id)).map((r) => r.id);
  }

  if (allowedIds.length === 0) {
    return { success: false, error: '삭제할 권한이 있는 일정이 없습니다.' };
  }

  const adminClient = createAdminClient();
  const { error, count } = await adminClient
    .from('student_absence_schedules')
    .delete({ count: 'exact' })
    .in('id', allowedIds);

  if (error) {
    console.error('Error bulk-deleting absence schedules:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/student/schedule');
  revalidatePath('/parent/schedule');
  revalidatePath('/admin/schedules');
  revalidatePath('/admin/attendance');
  return { success: true, deletedCount: count ?? allowedIds.length };
}

// 부재 스케줄 활성/비활성 토글
export async function toggleAbsenceSchedule(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // 현재 상태 조회
  const { data: schedule, error: fetchError } = await supabase
    .from('student_absence_schedules')
    .select('is_active')
    .eq('id', id)
    .single();

  if (fetchError) {
    return { success: false, error: fetchError.message };
  }

  // 상태 토글
  const { error } = await supabase
    .from('student_absence_schedules')
    .update({
      is_active: !schedule.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Error toggling absence schedule:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/student/schedule');
  revalidatePath('/parent/schedule');
  revalidatePath('/admin/schedules');
  revalidatePath('/admin/attendance');
  return { success: true };
}

// 특정 시간이 부재 면제 구간인지 확인 (버퍼 포함)
// 승인된 스케줄만 면제 적용
export async function isInAbsencePeriod(
  studentId: string,
  checkTime: Date,
  currentDateType?: 'semester' | 'vacation' | 'special',
): Promise<{
  isExempted: boolean;
  schedule?: StudentAbsenceSchedule;
  exemptionStart?: Date;
  exemptionEnd?: Date;
}> {
  const supabase = await createClient();

  // 활성화되고 승인된 부재 스케줄만 조회
  const { data: schedules, error } = await supabase
    .from('student_absence_schedules')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', true)
    .eq('status', 'approved'); // 승인된 것만

  if (error || !schedules) {
    return { isExempted: false };
  }

  const checkDate = format(checkTime, 'yyyy-MM-dd');
  const checkDayOfWeek = getDay(checkTime);

  for (const schedule of schedules) {
    // 날짜 타입 체크
    if (schedule.date_type !== 'all' && currentDateType) {
      if (schedule.date_type === 'semester' && currentDateType !== 'semester') continue;
      if (schedule.date_type === 'vacation' && currentDateType !== 'vacation') continue;
    }

    // 유효 기간 체크
    if (schedule.valid_from && checkDate < schedule.valid_from) continue;
    if (schedule.valid_until && checkDate > schedule.valid_until) continue;

    // 일회성 스케줄 체크
    if (!schedule.is_recurring) {
      if (schedule.specific_date !== checkDate) continue;
    } else {
      // 반복 스케줄: 요일 체크
      if (schedule.day_of_week && !schedule.day_of_week.includes(checkDayOfWeek)) continue;
    }

    // 시간 체크 (버퍼 포함)
    const scheduleStart = parse(schedule.start_time, 'HH:mm:ss', checkTime);
    const scheduleEnd = parse(schedule.end_time, 'HH:mm:ss', checkTime);

    const bufferMinutes = schedule.buffer_minutes || ABSENCE_BUFFER_MINUTES;
    const exemptionStart = subMinutes(scheduleStart, bufferMinutes);
    const exemptionEnd = addMinutes(scheduleEnd, bufferMinutes);

    if (isWithinInterval(checkTime, { start: exemptionStart, end: exemptionEnd })) {
      return {
        isExempted: true,
        schedule,
        exemptionStart,
        exemptionEnd,
      };
    }
  }

  return { isExempted: false };
}

// 오늘 해당하는 부재 스케줄 조회 (승인된 것만)
export async function getTodayAbsenceSchedules(
  studentId: string,
): Promise<StudentAbsenceSchedule[]> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayDayOfWeek = getDay(today);

  const { data: schedules, error } = await supabase
    .from('student_absence_schedules')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', true)
    .eq('status', 'approved'); // 승인된 것만

  if (error || !schedules) {
    return [];
  }

  return schedules.filter((schedule) => {
    // 유효 기간 체크
    if (schedule.valid_from && todayStr < schedule.valid_from) return false;
    if (schedule.valid_until && todayStr > schedule.valid_until) return false;

    // 일회성 스케줄
    if (!schedule.is_recurring) {
      return schedule.specific_date === todayStr;
    }

    // 반복 스케줄
    if (schedule.day_of_week && !schedule.day_of_week.includes(todayDayOfWeek)) {
      return false;
    }

    return true;
  });
}
