import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * 상벌점 도메인 SSOT — 분기 누적 벌점 계산.
 *
 * ## 상계는 상점·벌점 "한 쌍" 으로 기록된다
 *
 * 예전에는 30점 도달 상계 시 상점 쪽 음수 행 1개만 넣었다. 그래서 "1:1 상계" 인데
 * 실제로는 상점만 줄고 벌점은 그대로여서, 벌점 행을 합산하는 모든 화면
 * (주간 리포트 카드·관리자 현황·회원 상세·출결 주간표·학생앱)이 상계 전 숫자를 보여줬다.
 *
 *   상계     : reward −X + penalty −X   (event_kind 'offset_against_penalty')
 *   되돌리기 : reward +X + penalty +X   (event_kind 'offset_against_penalty_revert')
 *
 * 이제 벌점 행 합계 자체가 상계 반영값이다. 별도 차감이 필요 없고,
 * **여기서 또 빼면 이중 차감**이 된다.
 *
 *   net(잔존)  = 분기 벌점 행 합               ← 30점 임계 판정 기준값
 *   offset     = 분기 벌점 행 중 상계 계열의 절대합 (표시용)
 *   raw(원본)  = net + offset
 *
 * ⚠️ offset 을 셀 때 반드시 `type === 'penalty'` 로 한정해야 한다.
 *    한 쌍으로 기록되므로 event_kind 만으로 세면 상점·벌점이 둘 다 잡혀 2배가 된다.
 *
 * ## 판정 vs 표시
 *
 * - **판정**(임계 도달, 퇴원 마크 해제)은 반드시 DB 함수를 쓴다 → `getPenaltyQuarterState`.
 *   단일 트랜잭션·락 안에서 계산돼야 하기 때문이다.
 * - **표시**는 이미 조회한 points 행에서 계산해도 된다 → 아래 순수 함수들.
 *   DB `penalty_quarter_state` 와 반드시 같은 식을 유지해야 한다.
 */

/** 분기 순상계액 계산에 포함되는 event_kind */
export const OFFSET_EVENT_KINDS = [
  'offset_against_penalty',
  'offset_against_penalty_revert',
] as const;

/**
 * 하드 삭제가 금지된 event_kind — DB 트리거 protect_points_event_kind_delete 와 동일 목록.
 *
 * 상계 행은 분기 잔존 벌점의 유일한 진실 원천이라 지워지면 net 이 조작된다.
 * (실제로 상계 행이 하드 삭제되어 학생 상태가 깨진 사례가 있었다.)
 * DB 트리거가 최종 방어선이고, 앱 목록은 "조용히 건너뛰기" 와 사용자 안내를 위한 것이다.
 */
export const PROTECTED_DELETE_EVENT_KINDS = [
  'reset_on_threshold',
  'reset_on_threshold_revert',
  'redeem',
  'manual_cancel',
  'auto_daily_focus',
  'auto_vocab',
  'offset_against_penalty',
  'offset_against_penalty_revert',
] as const;

/** PostgREST `.not('event_kind', 'in', ...)` 용 필터 문자열 */
export const PROTECTED_DELETE_EVENT_KINDS_FILTER = `(${PROTECTED_DELETE_EVENT_KINDS.join(',')})`;

type PointRowForOffset = {
  type?: string | null;
  amount: number | null;
  event_kind?: string | null;
  created_at?: string | null;
};

/**
 * 이미 조회한 points 행에서 분기 순상계액을 계산한다 (표시용).
 * DB `penalty_quarter_state` 의 offset 식과 동일해야 한다.
 *
 * 상점 쪽 짝을 함께 세지 않도록 벌점 행만 대상으로 한다.
 */
export function sumPenaltyOffsetInQuarter(
  rows: PointRowForOffset[] | null | undefined,
  quarterStart: Date,
): number {
  let offset = 0;
  for (const r of rows ?? []) {
    if (r.type !== 'penalty') continue;
    if (!r.event_kind || !OFFSET_EVENT_KINDS.includes(r.event_kind as never)) continue;
    if (!r.created_at || new Date(r.created_at) < quarterStart) continue;
    // 상계는 음수, 되돌리기는 양수 → 부호 반전 합산이 순상계액
    offset += -(r.amount ?? 0);
  }
  return offset;
}

/**
 * 잔존(net) 벌점 — 분기 벌점 행 합. 상계는 이미 반영되어 있으므로 추가 차감하지 않는다.
 *
 * 0 미만으로는 내려가지 않는다. `cancel_point` 가 취소 상쇄 행을 "취소 시점" 으로
 * INSERT 하므로 이전 분기 벌점을 이번 분기에 취소하면 합이 음수로 끌리기 때문이다.
 * DB 도 동일하게 GREATEST(0, ...) 를 적용한다.
 */
export function computePenaltyNet(quarterPenaltySum: number): number {
  return Math.max(0, quarterPenaltySum);
}

/** 원본(상계 전) 분기 벌점 = 잔존 + 순상계액 */
export function computePenaltyRaw(net: number, offset: number): number {
  return net + offset;
}

export type PenaltyQuarterState = {
  quarterStart: string;
  /** 원본 (상계 전) */
  raw: number;
  /** 분기 순상계액 */
  offset: number;
  /** 잔존 — 30점 임계 판정 기준값 */
  net: number;
  /** 이번 범위에서 상계 자격을 이미 소진했는지 */
  offsetConsumed: boolean;
  /** 'quarter' = 분기당 1회 / 'lifetime' = 평생 1회 */
  limitScope: 'quarter' | 'lifetime';
};

/**
 * 분기 벌점 상태를 DB 에서 조회한다 (판정용 SSOT).
 *
 * 임계 도달 판정·퇴원 마크 해제처럼 결과가 데이터를 바꾸는 경로에서는
 * 반드시 이 함수를 써야 한다. 표시 전용 경로는 위 순수 함수로 충분하다.
 */
export async function getPenaltyQuarterState(
  supabase: SupabaseClient,
  studentId: string,
): Promise<PenaltyQuarterState> {
  const { data, error } = await supabase.rpc('penalty_quarter_state', {
    p_student_id: studentId,
  });
  if (error) throw new Error(`penalty_quarter_state: ${error.message}`);
  const d = data as {
    quarter_start: string;
    raw: number;
    offset: number;
    net: number;
    offset_consumed: boolean;
    limit_scope: 'quarter' | 'lifetime';
  };
  return {
    quarterStart: d.quarter_start,
    raw: d.raw,
    offset: d.offset,
    net: d.net,
    offsetConsumed: d.offset_consumed,
    limitScope: d.limit_scope,
  };
}

/**
 * 상계가 불필요해졌으면 되돌린다 (상점·벌점 양쪽 복구 + 1회 제한 해제).
 *
 * 벌점 취소·삭제 경로에서 호출한다. 되돌려도 net 이 30 미만일 때만 실행되며,
 * 되돌리면 다시 30 이상이 되는 경우에는 DB 가 'still_required' 를 반환하고 아무것도 하지 않는다.
 */
export async function maybeRevertPenaltyOffset(
  supabase: SupabaseClient,
  studentId: string,
): Promise<{ status: string; restored_reward?: number; restored_penalty?: number }> {
  const { data, error } = await supabase.rpc('maybe_revert_penalty_offset', {
    p_student_id: studentId,
  });
  if (error) throw new Error(`maybe_revert_penalty_offset: ${error.message}`);
  return data as { status: string; restored_reward?: number; restored_penalty?: number };
}
