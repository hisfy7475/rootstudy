import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelPayment,
  getNicepayMerchantKey,
  getNicepayMid,
  isCancelSuccess,
} from '@/lib/nicepay';
import { canCancelOrder, cancelReasonMessage } from './meal-order-rules';

type AdminClient = SupabaseClient;

export type MealCancelResult =
  | { success: true }
  | { success: false; error: string; status?: number };

type ProductJoin = {
  category: 'meal' | 'exam';
  status: 'active' | 'inactive' | 'sold_out';
};

type VariantJoin = {
  kind: 'one_time' | 'recurring';
  product_start_date: string;
  meal_products: ProductJoin | ProductJoin[] | null;
};

function pickVariant(raw: VariantJoin | VariantJoin[] | null): {
  kind: 'one_time' | 'recurring';
  productStart: string;
  category: 'meal' | 'exam';
  productStatus: 'active' | 'inactive' | 'sold_out';
} | null {
  const v = raw == null ? null : Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!v) return null;
  const productJoin = Array.isArray(v.meal_products) ? v.meal_products[0] : v.meal_products;
  const category = productJoin?.category ?? 'meal';
  // 상품 조인이 비면 차단 쪽으로 판정한다(fail-closed). !inner + FK NOT NULL 이라 실제로는
  // 발생하지 않지만, 조인 누락이 환불 가드를 조용히 무력화하는 형태로 두지 않는다.
  const productStatus = productJoin?.status ?? 'inactive';
  return { kind: v.kind, productStart: v.product_start_date, category, productStatus };
}

/**
 * 결제 완료 주문 취소 (meal/exam 공용) — NICEPay v3 pg-api + DB.
 * 호출 전 userId 권한 검증 완료 가정.
 *
 * 취소 데드라인은 variant.kind 와 product.category 를 조합해 판정.
 *  - exam: 절대 불가
 *  - recurring: 직전 주 금요일까지
 *  - one_time: 식사일 2일 전까지
 *  - 상품이 비활성(inactive)이면 기한과 무관하게 셀프 환불 불가
 *    (관리자 강제 취소 executeAdminMealOrderCancel 은 계속 가능)
 */
export async function executePaidMealOrderCancel(
  admin: AdminClient,
  params: { userId: string; mealOrderId: string },
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
      student_id,
      order_id,
      amount,
      status,
      tid,
      paid_at,
      created_at,
      meal_product_variants (
        kind,
        product_start_date,
        meal_products (category, status)
      )
    `,
    )
    .eq('id', params.mealOrderId)
    .maybeSingle();

  if (fetchErr || !order) {
    return { success: false, error: '주문을 찾을 수 없습니다.', status: 404 };
  }

  const raw = order as {
    id: string;
    user_id: string;
    student_id: string;
    order_id: string;
    amount: number;
    status: string;
    tid: string | null;
    paid_at: string | null;
    created_at: string;
    meal_product_variants: VariantJoin | VariantJoin[] | null;
  };

  const variant = pickVariant(raw.meal_product_variants);

  // 권한 — 결제자 본인이거나, 학부모-자녀 연결 관계의 자녀 결제건이면 통과.
  if (raw.user_id !== params.userId) {
    const { data: link } = await admin
      .from('parent_student_links')
      .select('parent_id')
      .eq('parent_id', params.userId)
      .eq('student_id', raw.student_id)
      .maybeSingle();
    if (!link) {
      return { success: false, error: '권한이 없습니다.', status: 403 };
    }
  }

  if (raw.status !== 'paid') {
    return { success: false, error: '결제 완료 주문만 취소할 수 있습니다.', status: 400 };
  }

  if (!raw.tid) {
    return { success: false, error: '거래 정보가 없습니다.', status: 400 };
  }

  if (!variant) {
    return { success: false, error: '주문 옵션 정보를 찾을 수 없습니다.', status: 400 };
  }

  const decision = canCancelOrder({
    category: variant.category,
    variantKind: variant.kind,
    productStart: variant.productStart,
    productStatus: variant.productStatus,
    purchasedAt: raw.paid_at ?? raw.created_at,
  });
  if (!decision.ok) {
    return { success: false, error: cancelReasonMessage(decision.reason), status: 400 };
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

  const cancelOk = cancel.httpOk && isCancelSuccess(cancel.result);

  await admin.from('payment_logs').insert({
    order_type: raw.order_id.startsWith('EXAM-') ? 'exam' : 'meal',
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
 * 관리자 강제 취소/환불 (meal/exam 공용) — userId·데드라인 검증 없음.
 * 호출부에서 관리자 권한 및 지점 일치 검증 후 호출.
 */
export async function executeAdminMealOrderCancel(
  admin: AdminClient,
  params: { mealOrderId: string; reason: string },
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
      tid
    `,
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
    order_type: raw.order_id.startsWith('EXAM-') ? 'exam' : 'meal',
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
