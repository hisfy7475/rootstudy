import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  approvePayment,
  getNicepayMerchantKey,
  getNicepayMid,
  isCardApproveSuccess,
  isCancelSuccess,
  netcancelPayment,
  verifyApproveResponseSignature,
  verifyAuthResponseSignature,
} from '@/lib/nicepay';
import { sendPushToUser } from '@/lib/push';

function pickForm(formData: FormData, ...keys: string[]): string {
  for (const k of keys) {
    const v = formData.get(k);
    if (v != null && String(v).length > 0) return String(v);
  }
  return '';
}

function siteOrigin(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    new URL(request.url).origin
  );
}

function redirectResult(
  request: Request,
  role: 'student' | 'parent',
  params: Record<string, string>
): NextResponse {
  const base = siteOrigin(request);
  const path = role === 'parent' ? '/parent/meals/pay/result' : '/student/meals/pay/result';
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u.toString());
}

type MealOrderRow = {
  id: string;
  user_id: string;
  student_id: string;
  product_id: string;
  order_id: string;
  amount: number;
  status: string;
  tid: string | null;
};

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectResult(request, 'student', { fail: '1', reason: 'invalid_body' });
  }

  const reqReserved = pickForm(formData, 'ReqReserved', 'reqReserved');
  const role: 'student' | 'parent' = reqReserved === 'p' ? 'parent' : 'student';

  const authResultCode = pickForm(formData, 'AuthResultCode', 'authResultCode');
  if (authResultCode !== '0000') {
    return redirectResult(request, role, {
      fail: '1',
      code: authResultCode || 'unknown',
      msg: encodeURIComponent(pickForm(formData, 'AuthResultMsg', 'authResultMsg') || ''),
    });
  }

  const txTid = pickForm(formData, 'TxTid', 'txTid');
  const orderId = pickForm(formData, 'Moid', 'moid');
  const amountRaw = pickForm(formData, 'Amt', 'amt');
  const authToken = pickForm(formData, 'AuthToken', 'authToken');
  const signature = pickForm(formData, 'Signature', 'signature');
  const respMid = pickForm(formData, 'MID', 'mid');
  const nextAppURL = pickForm(formData, 'NextAppURL', 'nextAppURL');
  const netCancelURL = pickForm(formData, 'NetCancelURL', 'netCancelURL');

  const mid = getNicepayMid();
  const merchantKey = getNicepayMerchantKey();

  if (!txTid || !orderId || !amountRaw || !authToken || !signature || !nextAppURL || !netCancelURL) {
    return redirectResult(request, role, { fail: '1', reason: 'missing_fields' });
  }

  if (respMid !== mid) {
    return redirectResult(request, role, { fail: '1', reason: 'mid_mismatch' });
  }

  const amount = parseInt(amountRaw, 10);
  if (!Number.isFinite(amount)) {
    return redirectResult(request, role, { fail: '1', reason: 'invalid_amount' });
  }

  if (!verifyAuthResponseSignature(authToken, respMid, amountRaw, merchantKey, signature)) {
    return redirectResult(request, role, { fail: '1', reason: 'invalid_signature' });
  }

  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('meal_orders')
    .select('id, user_id, student_id, product_id, order_id, amount, status, tid')
    .eq('order_id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    console.error('[nicepay/confirm] order not found', orderErr, orderId);
    return redirectResult(request, role, { fail: '1', reason: 'order_not_found' });
  }

  const row = order as MealOrderRow;

  if (row.status === 'paid' && row.tid) {
    if (row.tid === txTid) {
      return redirectResult(request, role, { ok: '1', order: row.id });
    }
    return redirectResult(request, role, { fail: '1', reason: 'already_paid' });
  }

  if (row.status !== 'pending') {
    return redirectResult(request, role, { fail: '1', reason: 'invalid_order_status' });
  }

  if (row.amount !== amount) {
    return redirectResult(request, role, { fail: '1', reason: 'amount_mismatch' });
  }

  const rawAuth = Object.fromEntries(formData.entries());

  await admin.from('payment_logs').insert({
    order_type: 'meal',
    order_id: orderId,
    tid: txTid,
    action: 'auth',
    amount,
    status: 'success',
    result_code: authResultCode,
    result_msg: pickForm(formData, 'AuthResultMsg', 'authResultMsg') || null,
    raw_request: rawAuth as unknown as Record<string, unknown>,
  });

  let approveResult: Awaited<ReturnType<typeof approvePayment>> | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 27_000);
    approveResult = await approvePayment(
      nextAppURL,
      {
        tid: txTid,
        authToken,
        mid: respMid,
        amt: amountRaw,
        merchantKey,
      },
      { signal: controller.signal }
    );
    clearTimeout(timer);
  } catch (e) {
    console.error('[nicepay/confirm] approve error', e);
    approveResult = null;
  }

  const paidAt = new Date().toISOString();

  const approveOk =
    approveResult && approveResult.httpOk && isCardApproveSuccess(approveResult.result);

  if (approveResult && approveOk && approveResult.result.Signature) {
    const sigOk = verifyApproveResponseSignature(
      approveResult.result.TID ?? txTid,
      respMid,
      approveResult.result.Amt ?? amountRaw,
      merchantKey,
      approveResult.result.Signature
    );
    if (!sigOk) {
      console.warn('[nicepay/confirm] approve Signature mismatch (승인은 ResultCode 기준 처리)', {
        orderId,
        tid: approveResult.result.TID ?? txTid,
      });
    }
  }

  if (!approveOk) {
    if (approveResult?.ediDate && approveResult.signData) {
      try {
        const net = await netcancelPayment(netCancelURL, {
          tid: txTid,
          authToken,
          mid: respMid,
          amt: amountRaw,
          ediDate: approveResult.ediDate,
          signData: approveResult.signData,
        });
        await admin.from('payment_logs').insert({
          order_type: 'meal',
          order_id: orderId,
          tid: txTid,
          action: 'netcancel',
          amount,
          status: isCancelSuccess(net.result) ? 'success' : 'fail',
          result_code: net.result.ResultCode ?? null,
          result_msg: net.result.ResultMsg ?? null,
          raw_response: { ...net.result, _raw: net.rawText } as unknown as Record<string, unknown>,
        });
      } catch (netErr) {
        console.error('[nicepay/confirm] netcancel', netErr);
      }
    }

    await admin
      .from('meal_orders')
      .update({ status: 'failed', updated_at: paidAt })
      .eq('id', row.id);

    const msg =
      approveResult?.result.ResultMsg ||
      (!approveResult?.httpOk ? '승인 통신 실패' : '승인 거절');
    return redirectResult(request, role, {
      fail: '1',
      reason: 'approve_failed',
      msg: encodeURIComponent(msg),
      code: approveResult?.result.ResultCode || '',
    });
  }

  const settledTid = approveResult!.result.TID ?? txTid;

  await admin
    .from('meal_orders')
    .update({
      status: 'paid',
      tid: settledTid,
      paid_at: paidAt,
      updated_at: paidAt,
    })
    .eq('id', row.id);

  await admin.from('payment_logs').insert({
    order_type: 'meal',
    order_id: orderId,
    tid: settledTid,
    action: 'approve',
    amount,
    status: 'success',
    result_code: approveResult!.result.ResultCode ?? null,
    result_msg: approveResult!.result.ResultMsg ?? null,
    raw_response: {
      ...approveResult!.result,
      _raw: approveResult!.rawText,
    } as unknown as Record<string, unknown>,
  });

  const ordersLink = role === 'parent' ? '/parent/meals/orders' : '/student/meals/orders';
  const title = '급식 결제 완료';
  const body = '급식 신청이 결제 완료되었습니다.';

  try {
    await admin.from('user_notifications').insert({
      user_id: row.user_id,
      type: 'system',
      title,
      message: body,
      link: ordersLink,
    });
  } catch (e) {
    console.error('[nicepay/confirm] user_notification', e);
  }

  if (row.student_id !== row.user_id) {
    try {
      await admin.from('student_notifications').insert({
        student_id: row.student_id,
        type: 'system',
        title,
        message: body,
        link: '/student/meals/orders',
      });
    } catch (e) {
      console.error('[nicepay/confirm] student_notification', e);
    }
  }

  void sendPushToUser(row.user_id, title, body, { path: ordersLink }).catch((e) =>
    console.error('[nicepay/confirm] push payer', e)
  );
  if (row.student_id !== row.user_id) {
    void sendPushToUser(row.student_id, title, body, { path: '/student/meals/orders' }).catch((e) =>
      console.error('[nicepay/confirm] push student', e)
    );
  }

  return redirectResult(request, role, { ok: '1', order: row.id });
}
