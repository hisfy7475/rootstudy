'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { escapeLike } from '@/lib/list-params';

export type UnifiedAppDomain = 'meal' | 'exam' | 'mentoring';

export type UnifiedAppStatus =
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'refunded'
  | 'failed'
  | 'unknown';

export interface UnifiedAppFilters {
  domain?: UnifiedAppDomain;
  status?: UnifiedAppStatus;
  /** 슈퍼관리자 전용. 일반 관리자는 입력 무시되고 자기 branch_id 강제. */
  branchId?: string;
  /** yyyy-MM-dd. 이용 기간이 검색 범위와 겹치는지 판정 (lower bound 포함). */
  fromDate?: string;
  /** yyyy-MM-dd. 이용 기간이 검색 범위와 겹치는지 판정 (upper bound 포함). */
  toDate?: string;
  /** 학생 이름·전화 ilike */
  q?: string;
  page: number;
  pageSize: number;
  sort: 'applied_at' | 'amount' | 'service_start_date';
  dir: 'asc' | 'desc';
}

export interface UnifiedAppRow {
  domain: UnifiedAppDomain;
  application_id: string;
  applied_at: string;
  status_normalized: UnifiedAppStatus;
  status_raw: string;
  user_id: string;
  student_id: string;
  branch_id: string;
  item_id: string;
  item_name: string | null;
  item_image_url: string | null;
  sub_category: string | null;
  amount: number | null;
  paid_at: string | null;
  meta: Record<string, unknown>;
  /** 신청 시점 좌석 (트리거가 자동 채움). 학생이 좌석 이동·퇴원해도 신청 당시 좌석 보존. */
  seat_number_snapshot: number | null;
  /** 이용일 시작 (meal/exam: product_start_date, mentoring: slot.date). */
  service_start_date: string;
  /** 이용일 종료 (meal/exam: product_end_date, mentoring: slot.date 와 동일). */
  service_end_date: string;
  /** 이용 시작 시간 (mentoring 만 채워짐, meal/exam 은 NULL). HH:mm:ss. */
  service_start_time: string | null;
  /** 이용 종료 시간 (mentoring 만 채워짐, meal/exam 은 NULL). HH:mm:ss. */
  service_end_time: string | null;
  /** 모의고사 선택 옵션 요약 ("유형: 현장 · 영역: 과탐"). exam 외 도메인은 NULL. */
  option_summary: string | null;
  // hydration 필드
  student_name: string | null;
  student_phone: string | null;
  student_withdrawn_at: string | null;
  /** 응시자(학생)의 현재 좌석. snapshot 과 비교해 "이동했음"을 UI에서 표시. */
  student_seat_number_current: number | null;
  user_name: string | null;
  branch_name: string | null;
  detail_href: string;
}

export interface UnifiedAppPage {
  rows: UnifiedAppRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** 엑셀 export 안전 상한 (메모리 폭주 방지). */
const EXPORT_HARD_CAP = 50_000;
/** export 페이지 루프 단위 (admin.ts 패턴 동일). */
const EXPORT_PAGE_SIZE = 1_000;

function logQueryError(scope: string, error: unknown): void {
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

function buildDetailHref(domain: UnifiedAppDomain, itemId: string): string {
  if (domain === 'meal') return `/admin/meals/${itemId}/orders`;
  if (domain === 'exam') return `/admin/mock-exams/${itemId}/orders`;
  return `/admin/mentoring?view=month&slot=${itemId}`;
}

type UnifiedAppDbRow = Omit<
  UnifiedAppRow,
  | 'student_name'
  | 'student_phone'
  | 'student_withdrawn_at'
  | 'student_seat_number_current'
  | 'user_name'
  | 'branch_name'
  | 'detail_href'
>;

/**
 * 학생 검색(q) → student_id 후보 prefetch.
 * 활성 학생만 매칭. 결과가 비어 있으면 호출자가 빈 페이지로 short-circuit.
 */
async function prefetchStudentIdsForSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  q: string,
): Promise<string[] | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;
  const pattern = `%${escapeLike(trimmed)}%`;
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'student')
    .is('withdrawn_at', null)
    .or(`name.ilike.${pattern},phone.ilike.${pattern}`);
  return (data ?? []).map((p) => p.id as string);
}

/**
 * 결과 row 목록에 student/user/branch 이름을 in-memory 로 주입.
 * VIEW 가 join 을 안 하므로 이 단계에서 한 번에 prefetch.
 */
async function hydrateRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raw: UnifiedAppDbRow[],
): Promise<UnifiedAppRow[]> {
  if (raw.length === 0) return [];

  const profileIds = new Set<string>();
  const branchIds = new Set<string>();
  for (const r of raw) {
    if (r.student_id) profileIds.add(r.student_id);
    if (r.user_id) profileIds.add(r.user_id);
    if (r.branch_id) branchIds.add(r.branch_id);
  }

  const studentIds = new Set<string>();
  for (const r of raw) if (r.student_id) studentIds.add(r.student_id);

  const [profileRes, branchRes, studentProfileRes] = await Promise.all([
    profileIds.size > 0
      ? supabase
          .from('profiles')
          .select('id, name, phone, withdrawn_at')
          .in('id', Array.from(profileIds))
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            name: string;
            phone: string | null;
            withdrawn_at: string | null;
          }>,
        }),
    branchIds.size > 0
      ? supabase.from('branches').select('id, name').in('id', Array.from(branchIds))
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    studentIds.size > 0
      ? supabase.from('student_profiles').select('id, seat_number').in('id', Array.from(studentIds))
      : Promise.resolve({ data: [] as Array<{ id: string; seat_number: number | null }> }),
  ]);

  const profileMap = new Map<
    string,
    { name: string; phone: string | null; withdrawn_at: string | null }
  >();
  for (const p of profileRes.data ?? []) {
    profileMap.set(p.id as string, {
      name: p.name as string,
      phone: (p.phone as string | null) ?? null,
      withdrawn_at: (p.withdrawn_at as string | null) ?? null,
    });
  }
  const branchMap = new Map<string, string>();
  for (const b of branchRes.data ?? []) branchMap.set(b.id as string, b.name as string);
  const seatMap = new Map<string, number | null>();
  for (const sp of studentProfileRes.data ?? [])
    seatMap.set(sp.id as string, (sp.seat_number as number | null) ?? null);

  return raw.map((r) => {
    const student = profileMap.get(r.student_id);
    const user = profileMap.get(r.user_id);
    return {
      ...r,
      student_name: student?.name ?? null,
      student_phone: student?.phone ?? null,
      student_withdrawn_at: student?.withdrawn_at ?? null,
      student_seat_number_current: seatMap.get(r.student_id) ?? null,
      user_name: user?.name ?? null,
      branch_name: branchMap.get(r.branch_id) ?? null,
      detail_href: buildDetailHref(r.domain, r.item_id),
    };
  });
}

/**
 * 통합 신청내역 페이지 단위 조회. /admin/applications 의 단일 데이터 진입점.
 *
 * 권한:
 * - 일반 admin: filters.branchId 입력 무시, ctx.branchId 강제.
 * - 슈퍼 admin: filters.branchId 있으면 그 지점만, 없으면 전 지점.
 *
 * VIEW 의 underlying RLS 가 admin 에 모든 지점을 허용하므로 branch 격리는 이 함수가 책임.
 */
export async function getUnifiedApplicationsForAdmin(
  filters: UnifiedAppFilters,
): Promise<UnifiedAppPage> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch();
  if (!ctx) {
    return { rows: [], total: 0, page: 1, pageSize: filters.pageSize };
  }

  const studentIds = filters.q ? await prefetchStudentIdsForSearch(supabase, filters.q) : null;
  if (studentIds !== null && studentIds.length === 0) {
    return { rows: [], total: 0, page: 1, pageSize: filters.pageSize };
  }

  const effectiveBranchId = ctx.isSuperAdmin ? filters.branchId?.trim() || null : ctx.branchId;

  const page = Math.max(1, filters.page | 0);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize | 0));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('unified_applications')
    .select('*', { count: 'exact' })
    .order(filters.sort, { ascending: filters.dir === 'asc' })
    .range(from, to);

  if (effectiveBranchId) query = query.eq('branch_id', effectiveBranchId);
  if (filters.domain) query = query.eq('domain', filters.domain);
  if (filters.status) query = query.eq('status_normalized', filters.status);
  // 이용 기간 "겹침" 의미: service_start_date <= toDate AND service_end_date >= fromDate
  if (filters.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.fromDate)) {
    query = query.gte('service_end_date', filters.fromDate);
  }
  if (filters.toDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.toDate)) {
    query = query.lte('service_start_date', filters.toDate);
  }
  if (studentIds) query = query.in('student_id', studentIds);

  const { data, count, error } = await query;
  if (error) {
    logQueryError('[getUnifiedApplicationsForAdmin]', error);
    return { rows: [], total: 0, page: 1, pageSize };
  }

  const rows = await hydrateRows(supabase, (data ?? []) as UnifiedAppDbRow[]);
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = total === 0 ? 1 : Math.min(page, lastPage);
  return { rows, total, page: clampedPage, pageSize };
}

/**
 * 엑셀 export 용 전체 조회 (페이지네이션 무시).
 * 1000건 단위로 끊어서 EXPORT_HARD_CAP 까지 누적. 초과 시 절단된 결과를 반환.
 */
export async function exportUnifiedApplicationsForAdmin(
  filters: Omit<UnifiedAppFilters, 'page' | 'pageSize'>,
): Promise<{ rows: UnifiedAppRow[]; truncated: boolean }> {
  const supabase = await createClient();
  const ctx = await requireAdminBranch();
  if (!ctx) return { rows: [], truncated: false };

  const studentIds = filters.q ? await prefetchStudentIdsForSearch(supabase, filters.q) : null;
  if (studentIds !== null && studentIds.length === 0) return { rows: [], truncated: false };

  const effectiveBranchId = ctx.isSuperAdmin ? filters.branchId?.trim() || null : ctx.branchId;

  const accumulated: UnifiedAppDbRow[] = [];
  let offset = 0;
  let truncated = false;

  while (offset < EXPORT_HARD_CAP) {
    let query = supabase
      .from('unified_applications')
      .select('*')
      .order(filters.sort, { ascending: filters.dir === 'asc' })
      .range(offset, offset + EXPORT_PAGE_SIZE - 1);

    if (effectiveBranchId) query = query.eq('branch_id', effectiveBranchId);
    if (filters.domain) query = query.eq('domain', filters.domain);
    if (filters.status) query = query.eq('status_normalized', filters.status);
    // 이용 기간 "겹침" 의미: service_start_date <= toDate AND service_end_date >= fromDate
    if (filters.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.fromDate)) {
      query = query.gte('service_end_date', filters.fromDate);
    }
    if (filters.toDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.toDate)) {
      query = query.lte('service_start_date', filters.toDate);
    }
    if (studentIds) query = query.in('student_id', studentIds);

    const { data, error } = await query;
    if (error) {
      logQueryError('[exportUnifiedApplicationsForAdmin]', error);
      break;
    }
    const batch = (data ?? []) as UnifiedAppDbRow[];
    accumulated.push(...batch);
    if (batch.length < EXPORT_PAGE_SIZE) break;
    offset += EXPORT_PAGE_SIZE;
    if (offset >= EXPORT_HARD_CAP) {
      truncated = true;
      break;
    }
  }

  const rows = await hydrateRows(supabase, accumulated);
  return { rows, truncated };
}
