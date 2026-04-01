import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelPayment,
  getNicepayMerchantKey,
  getNicepayMid,
  isCancelSuccess,
} from '@/lib/nicepay';
import { canCancelMealOrderByDeadline } from './meal-order-rules';

type AdminClient = SupabaseClient;

export type MealCancelResult =
  | { success: true }
  | { success: false; error: string; status?: number };

/**
 * 결제 완료 급식 주문 취소 (나이스페이 v3 pg-api + DB). 호출 전 userId 권한 검증 완료 가정.
 */
export async function executePaidMealOrderCancel(
  admin: AdminClient,
  params: { userId: string; mealOrderId: string }
): Promise<MealCancelResult> {
  const mid = getNicepayMid();
  const merchantKey = getNicepayMerchantKey();
  if (!mid || !merchantKey) {
    return { success: false, error: '결제 서버 설정이 없습니다.', status: 500 };
  }

  const { data: order, error: fetchErr } = await admin
    .from('meal_orders')
    .select(
      `
      id,
      user_id,
      order_id,
      amount,
      status,
      tid,
      meal_products (meal_start_date)
    `
    )
    .eq('id', params.mealOrderId)
    .maybeSingle();

  if (fetchErr || !order) {
    return { success: false, error: '주문을 찾을 수 없습니다.', status: 404 };
  }

  const raw = order as {
    id: string;
    user_id: string;
    order_id: string;
    amount: number;
    status: string;
    tid: string | null;
    meal_products: { meal_start_date: string } | { meal_start_date: string }[] | null;
  };

  const product =
    raw.meal_products == null
      ? null
      : Array.isArray(raw.meal_products)
        ? raw.meal_products[0]
        : raw.meal_products;

  if (raw.user_id !== params.userId) {
    return { success: false, error: '권한이 없습니다.', status: 403 };
  }

  if (raw.status !== 'paid') {
    return { success: false, error: '결제 완료 주문만 취소할 수 있습니다.', status: 400 };
  }

  if (!raw.tid) {
    return { success: false, error: '거래 정보가 없습니다.', status: 400 };
  }

  const mealStart = product?.meal_start_date;
  if (mealStart && !canCancelMealOrderByDeadline(mealStart)) {
    return { success: false, error: '식사일 2일 전까지만 취소할 수 있습니다.', status: 400 };
  }

  const cancelAmt = String(Math.trunc(raw.amount));
  const cancel = await cancelPayment({
    tid: raw.tid,
    mid,
    merchantKey,
    cancelAmt,
    moid: raw.order_id,
    cancelMsg: '사용자 취소',
    partialCancelCode: '0',
  });

  const cancelOk =
    cancel.httpOk && isCancelSuccess(cancel.result);

  await admin.from('payment_logs').insert({
    order_type: 'meal',
    order_id: raw.order_id,
    tid: raw.tid,
    action: 'cancel',
    amount: raw.amount,
    status: cancelOk ? 'success' : 'fail',
    result_code: cancel.result.ResultCode ?? null,
    result_msg: cancel.result.ResultMsg ?? null,
    raw_response: {
      ...cancel.result,
      _raw: cancel.rawText,
    } as unknown as Record<string, unknown>,
  });

  if (!cancelOk) {
    return {
      success: false,
      error: cancel.result.ResultMsg || '결제 취소에 실패했습니다.',
      status: 502,
    };
  }

  const now = new Date().toISOString();
  await admin
    .from('meal_orders')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_reason: '사용자 취소',
      updated_at: now,
    })
    .eq('id', raw.id);

  return { success: true };
}

/**
 * 관리자 강제 취소/환불 — user_id·식사일 데드라인 검증 없음.
 * 호출부에서 관리자 권한 및 지점 일치 검증 후 호출.
 */
export async function executeAdminMealOrderCancel(
  admin: AdminClient,
  params: { mealOrderId: string; reason: string }
): Promise<MealCancelResult> {
  const mid = getNicepayMid();
  const merchantKey = getNicepayMerchantKey();
  if (!mid || !merchantKey) {
    return { success: false, error: '결제 서버 설정이 없습니다.', status: 500 };
  }

  const { data: order, error: fetchErr } = await admin
    .from('meal_orders')
    .select(
      `
      id,
      user_id,
      order_id,
      amount,
      status,
      tid,
      meal_products (meal_start_date)
    `
    )
    .eq('id', params.mealOrderId)
    .maybeSingle();

  if (fetchErr || !order) {
    return { success: false, error: '주문을 찾을 수 없습니다.', status: 404 };
  }

  const raw = order as {
    id: string;
    user_id: string;
    order_id: string;
    amount: number;
    status: string;
    tid: string | null;
    meal_products: { meal_start_date: string } | { meal_start_date: string }[] | null;
  };

  if (raw.status !== 'paid') {
    return { success: false, error: '결제 완료 주문만 취소할 수 있습니다.', status: 400 };
  }

  if (!raw.tid) {
    return { success: false, error: '거래 정보가 없습니다.', status: 400 };
  }

  const reason = params.reason.trim() || '관리자 취소';
  const cancelAmt = String(Math.trunc(raw.amount));
  const cancel = await cancelPayment({
    tid: raw.tid,
    mid,
    merchantKey,
    cancelAmt,
    moid: raw.order_id,
    cancelMsg: reason,
    partialCancelCode: '0',
  });

  const cancelOk = cancel.httpOk && isCancelSuccess(cancel.result);

  await admin.from('payment_logs').insert({
    order_type: 'meal',
    order_id: raw.order_id,
    tid: raw.tid,
    action: 'cancel',
    amount: raw.amount,
    status: cancelOk ? 'success' : 'fail',
    result_code: cancel.result.ResultCode ?? null,
    result_msg: cancel.result.ResultMsg ?? null,
    raw_response: {
      ...cancel.result,
      _raw: cancel.rawText,
    } as unknown as Record<string, unknown>,
  });

  if (!cancelOk) {
    return {
      success: false,
      error: cancel.result.ResultMsg || '결제 취소에 실패했습니다.',
      status: 502,
    };
  }

  const now = new Date().toISOString();
  await admin
    .from('meal_orders')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_reason: reason,
      updated_at: now,
    })
    .eq('id', raw.id);

  return { success: true };
}
