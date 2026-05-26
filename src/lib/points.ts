import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';
import { REWARD_RULES } from './constants';

/**
 * 도메인 SSOT — 상벌점/상품권 잔액 계산 + RPC 래퍼.
 *
 * 모든 critical 액션(임계치, 발급, 검토 취소)은 Postgres RPC 로 처리해
 * 단일 트랜잭션·CAS·락을 보장한다. 이 파일은 RPC 호출만 한다.
 *
 * 잔액 계산 규칙:
 * - reward 잔액 = SUM(points.amount WHERE type='reward')
 *   양수 행: reward 부여 / reset_on_threshold_revert / offset_against_penalty_revert
 *   음수 행: redeem / reset_on_threshold / manual_cancel / offset_against_penalty
 * - 가용 잔액 = 잔액 − 큐(requested+auto_pending) × 100
 * - 분기 누적 벌점 (raw) = SUM(amount WHERE type='penalty' AND created_at >= 분기시작)
 * - 분기 누적 벌점 (net) = raw − student_profiles.penalty_offset_in_quarter_total
 *   (신규 정책: 30점 도달 시 1:1 상계로 차감된 누계 반영)
 */

// =============================================
// 잔액 / 누적 조회
// =============================================

/** 학생의 현재 상점 잔액 (음수 행 포함 합산) */
export async function getRewardBalance(
  supabase: SupabaseClient,
  studentId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('points')
    .select('amount')
    .eq('student_id', studentId)
    .eq('type', 'reward');
  if (error) {
    console.error('getRewardBalance error:', error);
    return 0;
  }
  return (data ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);
}

/** 큐(requested+auto_pending) 차감한 신청 가능 잔액 */
export async function getAvailableBalance(
  supabase: SupabaseClient,
  studentId: string,
): Promise<{ balance: number; queue: number; available: number }> {
  const [balance, { count: queue }] = await Promise.all([
    getRewardBalance(supabase, studentId),
    supabase
      .from('reward_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .in('status', ['requested', 'auto_pending']),
  ]);
  const q = queue ?? 0;
  return {
    balance,
    queue: q,
    available: Math.max(0, balance - q * REWARD_RULES.redeemAt),
  };
}

/** KST 현재 분기 누적 벌점 (raw — 상계 차감 전) */
export async function getCurrentQuarterPenaltyRaw(
  supabase: SupabaseClient,
  studentId: string,
  quarterStart: Date,
): Promise<number> {
  const { data, error } = await supabase
    .from('points')
    .select('amount')
    .eq('student_id', studentId)
    .eq('type', 'penalty')
    .gte('created_at', quarterStart.toISOString());
  if (error) {
    console.error('getCurrentQuarterPenaltyRaw error:', error);
    return 0;
  }
  return (data ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);
}

/**
 * KST 현재 분기 누적 벌점 (net — 상계 차감 후, 임계 판정용)
 * = raw SUM − student_profiles.penalty_offset_in_quarter_total
 */
export async function getCurrentQuarterPenaltyNet(
  supabase: SupabaseClient,
  studentId: string,
  quarterStart: Date,
): Promise<number> {
  const [raw, { data: profile }] = await Promise.all([
    getCurrentQuarterPenaltyRaw(supabase, studentId, quarterStart),
    supabase
      .from('student_profiles')
      .select('penalty_offset_in_quarter_total')
      .eq('id', studentId)
      .maybeSingle(),
  ]);
  const offset = profile?.penalty_offset_in_quarter_total ?? 0;
  return raw - offset;
}

/** @deprecated raw 누적이 필요한 경우 getCurrentQuarterPenaltyRaw 사용. 임계 판정은 net 사용. */
export const getCurrentQuarterPenalty = getCurrentQuarterPenaltyRaw;

// =============================================
// Critical RPC 래퍼
// =============================================

export type ThresholdResult =
  | {
      status: 'offset';
      offset_amount: number;
      reward_after: number;
      penalty_after_net: number;
      will_require_withdrawal: false;
      protected_queue_count: number;
    }
  | {
      status: 'withdrawal_required';
      offset_amount: 0;
      reward_after: number;
      penalty_after_net: number;
      will_require_withdrawal: true;
      protected_queue_count: number;
    }
  | { status: 'not_a_student' };

/** 30점 도달 처리 (단일 트랜잭션 RPC) — 신규 정책: 1:1 상계 또는 강제 퇴원 대상 마크 */
export async function handlePenaltyThreshold(
  supabase: SupabaseClient,
  studentId: string,
): Promise<ThresholdResult> {
  const { data, error } = await supabase.rpc('handle_penalty_threshold', {
    p_student_id: studentId,
  });
  if (error) throw new Error(`handle_penalty_threshold: ${error.message}`);
  return data as ThresholdResult;
}

export type GivePenaltyResult = {
  point_id: string;
  total_before: number;
  total_after: number;
  warnings: Array<'warn_10' | 'warn_20' | 'warn_25'>;
  threshold: ThresholdResult | null;
};

/** 벌점 부여 + 임계치 hook + dedupe (단일 트랜잭션 RPC) */
export async function givePenaltyWithThresholdCheck(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    adminId: string;
    amount: number;
    reason: string;
    presetId?: string | null;
    eventKind?: string;
  },
): Promise<GivePenaltyResult> {
  const { data, error } = await supabase.rpc('give_penalty_with_threshold_check', {
    p_student_id: params.studentId,
    p_admin_id: params.adminId,
    p_amount: params.amount,
    p_reason: params.reason,
    p_preset_id: params.presetId ?? null,
    p_event_kind: params.eventKind ?? 'manual',
  });
  if (error) throw error;
  return data as GivePenaltyResult;
}

export type CancelReviewResult =
  | { status: 'cancelled'; restored_reward: number; cancelled_pending: number }
  | { status: 'not_in_review' };

/** 검토 취소 + 옵션 상점 복구 */
export async function cancelWithdrawalReview(
  supabase: SupabaseClient,
  studentId: string,
  restoreReward: boolean = true,
): Promise<CancelReviewResult> {
  const { data, error } = await supabase.rpc('cancel_withdrawal_review', {
    p_student_id: studentId,
    p_restore_reward: restoreReward,
  });
  if (error) throw new Error(`cancel_withdrawal_review: ${error.message}`);
  return data as CancelReviewResult;
}

export type IssueResult =
  | { status: 'issued'; student_id: string }
  | { status: 'rejected_insufficient'; balance: number }
  | { status: 'not_pending' };

/** 상품권 발급 — 잔액 검증 + redeem 행 INSERT (단일 트랜잭션) */
export async function issueRedemption(
  supabase: SupabaseClient,
  params: {
    redemptionId: string;
    adminId: string;
    voucherAmount: number;
    voucherCode: string;
    voucherNote?: string | null;
  },
): Promise<IssueResult> {
  const { data, error } = await supabase.rpc('issue_redemption', {
    p_redemption_id: params.redemptionId,
    p_admin_id: params.adminId,
    p_voucher_amount: params.voucherAmount,
    p_voucher_code: params.voucherCode,
    p_voucher_note: params.voucherNote ?? null,
  });
  if (error) throw new Error(`issue_redemption: ${error.message}`);
  return data as IssueResult;
}

export type PenaltyPreview = {
  /** net 분기 누적 (raw − offset) */
  quarter_total_before: number;
  quarter_total_after: number;
  thresholds_reached: number[];
  reaches_30: boolean;
  current_balance: number;
  queue_count: number;
  /** @deprecated 구 정책 호환용. 항상 0. */
  protected_auto_pending: number;
  /** @deprecated 구 정책 호환용. 항상 0. */
  burnt_estimate: number;
  /** 신규 정책: 상계 예상 금액 */
  offset_estimate: number;
  /** 신규 정책: 상계 후 상점 잔액 */
  reward_after_offset: number;
  /** 신규 정책: 상계 후 net 분기 누적 벌점 */
  penalty_after_offset_net: number;
  /** 신규 정책: 가용 상점 0 + 30점 도달 여부 */
  will_require_withdrawal: boolean;
};

/** 벌점 부여 dry-run (관리자 confirm 모달용) */
export async function previewPenalty(
  supabase: SupabaseClient,
  studentId: string,
  amount: number,
): Promise<PenaltyPreview> {
  const { data, error } = await supabase.rpc('preview_penalty', {
    p_student_id: studentId,
    p_amount: amount,
  });
  if (error) throw new Error(`preview_penalty: ${error.message}`);
  return data as PenaltyPreview;
}
