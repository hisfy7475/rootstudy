// 지각/조기퇴실 자동 벌점 판정 — 앱 서버액션과 CAPS 동기화 크론 양쪽에서 공용.
//
// 이 모듈은 'use server' 가 아니다. (server action 파일은 supabase 클라이언트 같은
// 비직렬화 인자를 export 함수에 넘길 수 없으므로, 로직을 일반 모듈로 분리한다.)
// 호출자가 자신의 supabase 클라이언트를 주입한다:
//   - 앱: cookie 바인딩 createClient() (학생 본인, RPC 는 SECURITY DEFINER)
//   - 크론: service-role 클라이언트
//
// 시간 비교는 전부 KST 벽시계 기준이다. 절대 서버 로컬 타임존(Vercel=UTC)에
// 의존하지 않는다 (CLAUDE.md 도메인 규칙).

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStudyDate } from '@/lib/utils';
import { PENALTY_RULES, ABSENCE_BUFFER_MINUTES } from '@/lib/constants';
import { notifyPointsGranted } from '@/lib/actions/notification';

// 앱(cookie 바인딩)·크론(service-role) 양쪽에서 주입한다.
// 프로젝트 전역이 createClient<any>/createServerClient<any> 를 쓰므로 동일하게 비타입드로 둔다.
export type PenaltyClient = SupabaseClient;
type Client = PenaltyClient;

export type AttendancePenaltyType = 'late' | 'early';

const PRESET_CODE: Record<AttendancePenaltyType, string> = {
  late: 'late_checkin',
  early: 'early_checkout',
};

// 'HH:MM' / 'HH:MM:SS' → 분 (24시 이상 허용: 예 '25:30' → 1530)
function toMinutes(time: string): number | null {
  const parts = time.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] ?? '0');
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// 주어진 시각의 KST 벽시계 분 (0~1439)
function kstWallMinutes(at: Date): number {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

// 학습일(YYYY-MM-DD, KST 06:00 시작) 문자열
function studyDateStr(at: Date): string {
  return getStudyDate(at).toISOString().split('T')[0];
}

export type MandatoryTime = {
  startTime: string | null;
  endTime: string | null;
  dateTypeName: string | null;
};

// 특정 날짜의 의무시간 조회 (주입 클라이언트 사용 — date-type.ts getMandatoryTime 의 클라이언트 주입판)
export async function fetchMandatoryTime(
  supabase: Client,
  branchId: string,
  dateStr: string,
): Promise<MandatoryTime> {
  const { data: assignment } = await supabase
    .from('date_assignments')
    .select(
      `custom_start_time, custom_end_time, date_type:date_type_id ( name, default_start_time, default_end_time )`,
    )
    .eq('branch_id', branchId)
    .eq('date', dateStr)
    .maybeSingle();

  if (!assignment || !assignment.date_type) {
    return { startTime: null, endTime: null, dateTypeName: null };
  }
  const dt = assignment.date_type as unknown as {
    name: string;
    default_start_time: string;
    default_end_time: string;
  };
  return {
    startTime: assignment.custom_start_time || dt.default_start_time,
    endTime: assignment.custom_end_time || dt.default_end_time,
    dateTypeName: dt.name,
  };
}

// date_type 이름(자유 텍스트, 보통 한글)을 부재 스케줄의 enum 으로 best-effort 매핑.
function mapDateTypeName(name: string | null): 'semester' | 'vacation' | 'special' | null {
  if (!name) return null;
  if (name.includes('방학')) return 'vacation';
  if (name.includes('학기')) return 'semester';
  return 'special';
}

// 부재 면제 여부 (KST 기준). 승인·활성 스케줄만, 버퍼 포함.
async function isExemptKST(
  supabase: Client,
  studentId: string,
  at: Date,
  dateTypeName: string | null,
): Promise<boolean> {
  const { data: schedules } = await supabase
    .from('student_absence_schedules')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_active', true)
    .eq('status', 'approved');

  if (!schedules || schedules.length === 0) return false;

  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = kst.toISOString().split('T')[0]; // KST 달력일
  const dayOfWeek = kst.getUTCDay(); // 0=일
  const nowMin = kstWallMinutes(at);
  const mapped = mapDateTypeName(dateTypeName);

  for (const s of schedules as Array<Record<string, unknown>>) {
    const sType = s.date_type as string | null;
    if (sType && sType !== 'all') {
      if (!mapped || sType !== mapped) continue;
    }

    const validFrom = s.valid_from as string | null;
    const validUntil = s.valid_until as string | null;
    if (validFrom && dateStr < validFrom) continue;
    if (validUntil && dateStr > validUntil) continue;

    if (!(s.is_recurring as boolean)) {
      if ((s.specific_date as string | null) !== dateStr) continue;
    } else {
      const dow = s.day_of_week as number[] | null;
      if (dow && !dow.includes(dayOfWeek)) continue;
    }

    const startMin = toMinutes((s.start_time as string) ?? '');
    const endMin = toMinutes((s.end_time as string) ?? '');
    if (startMin === null || endMin === null) continue;

    const buffer = (s.buffer_minutes as number | null) ?? ABSENCE_BUFFER_MINUTES;
    if (nowMin >= startMin - buffer && nowMin <= endMin + buffer) {
      return true;
    }
  }
  return false;
}

type SystemPreset = {
  id: string;
  amount: number;
  reason: string;
  auto_enabled: boolean;
  is_active: boolean;
};

async function fetchSystemPreset(
  supabase: Client,
  branchId: string,
  code: string,
): Promise<SystemPreset | null> {
  const { data } = await supabase
    .from('penalty_presets')
    .select('id, amount, reason, auto_enabled, is_active')
    .eq('branch_id', branchId)
    .eq('code', code)
    .maybeSingle();
  return (data as SystemPreset | null) ?? null;
}

async function resolveBranchId(supabase: Client, studentId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', studentId)
    .maybeSingle();
  return (data?.branch_id as string | null) ?? null;
}

export type EvaluateResult = { charged: true } | { charged: false; reason: string };

/**
 * 한 건의 입실/퇴실 이벤트에 대해 지각/조기퇴실 자동 벌점을 평가·부과한다.
 * - 비교 기준 시각은 `at` (이벤트 실제 시각). 절대 now() 가 아니다.
 * - 해당 지점 시스템 프리셋의 auto_enabled=true && is_active=true 일 때만 부과.
 * - 같은 학생/프리셋/학습일 중복은 unique index(23505) 로 차단(silent skip).
 *
 * 성능: CAPS 크론은 branchId/mandatory 를 주입해 레코드별 재조회를 피할 수 있다.
 */
export async function evaluateAttendancePenalty(params: {
  supabase: Client;
  studentId: string;
  type: AttendancePenaltyType;
  at: Date;
  branchId?: string | null;
  mandatory?: MandatoryTime;
}): Promise<EvaluateResult> {
  const { supabase, studentId, type, at } = params;

  const branchId = params.branchId ?? (await resolveBranchId(supabase, studentId));
  if (!branchId) return { charged: false, reason: 'no_branch' };

  const dateStr = studyDateStr(at);
  const mandatory = params.mandatory ?? (await fetchMandatoryTime(supabase, branchId, dateStr));

  const targetTime = type === 'late' ? mandatory.startTime : mandatory.endTime;
  if (!targetTime) return { charged: false, reason: 'no_mandatory_time' };

  const targetMin = toMinutes(targetTime);
  if (targetMin === null) return { charged: false, reason: 'bad_mandatory_time' };

  const grace = PENALTY_RULES.graceMinutes;
  let atMin = kstWallMinutes(at);

  let triggered = false;
  if (type === 'late') {
    // 의무 시작 + 버퍼 초과 입실
    triggered = atMin > targetMin + grace;
  } else {
    // 의무 종료가 24시 이상(예: 25:30)인데 새벽(06:00 이전) 퇴실이면 같은 학습일의 심야 → +1440 보정
    if (targetMin >= 1440 && atMin < 6 * 60) atMin += 1440;
    // 의무 종료 - 버퍼 이전 퇴실
    triggered = atMin < targetMin - grace;
  }
  if (!triggered) return { charged: false, reason: 'within_grace' };

  // 시스템 프리셋 + 자동 부과 게이팅
  const preset = await fetchSystemPreset(supabase, branchId, PRESET_CODE[type]);
  if (!preset) return { charged: false, reason: 'no_preset' };
  if (!preset.is_active || !preset.auto_enabled) return { charged: false, reason: 'auto_disabled' };

  // 부재 면제
  if (await isExemptKST(supabase, studentId, at, mandatory.dateTypeName)) {
    return { charged: false, reason: 'exempted' };
  }

  // 부과 — threshold RPC 통일 (event_kind 정확 기록 + 임계/강제퇴원 마크 + 학습일 중복차단)
  const eventKind = type === 'late' ? 'auto_late' : 'auto_early';
  const { error } = await supabase.rpc('give_penalty_with_threshold_check', {
    p_student_id: studentId,
    p_admin_id: null,
    p_amount: preset.amount,
    p_reason: preset.reason,
    p_preset_id: preset.id,
    p_event_kind: eventKind,
    p_study_date: dateStr,
  });

  if (error) {
    // 같은 학생/프리셋/학습일에 이미 부여됨 → 정상(중복 차단), 알림 안 함
    if ((error as { code?: string }).code === '23505') {
      return { charged: false, reason: 'duplicate' };
    }
    console.error('[attendance-penalty] RPC error:', error);
    return { charged: false, reason: 'rpc_error' };
  }

  // 학생 + 학부모 앱 알림 + 푸시
  await notifyPointsGranted({
    studentId,
    type: 'penalty',
    amount: preset.amount,
    reason: preset.reason,
  }).catch((e) => console.error('[attendance-penalty] notify error:', e));

  return { charged: true };
}
