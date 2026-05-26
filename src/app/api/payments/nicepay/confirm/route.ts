import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
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
import { formatOptionSelectionsSummary, parseOptionSelections } from '@/lib/mock-exam-options';
import { parseEucKrFormBody } from '@/lib/nicepay-encoding';

type OrderCategory = 'meal' | 'exam';

function pickForm(formData: URLSearchParams, ...keys: string[]): string {
  for (const k of keys) {
    const v = formData.get(k);
    if (v != null && v.length > 0) return v;
  }
  return '';
}

function categoryFromOrderId(orderId: string | undefined | null): OrderCategory {
  return orderId && orderId.startsWith('EXAM-') ? 'exam' : 'meal';
}

function categorySlug(category: OrderCategory): string {
  return category === 'exam' ? 'mock-exams' : 'meals';
}

function resolveRequestOrigin(request: Request): string {
  // next dev 의 request.url 은 실제 Host 헤더가 아닌 내부 기본값(localhost:3000)을 반환하는
  // 경우가 있어, 폰 WebView가 LAN IP 로 접속했는데 redirect 가 localhost 로 나가버린다.
  // Host / X-Forwarded-Host 헤더를 우선 사용한다.
  const fwdHost = request.headers.get('x-forwarded-host');
  const host = fwdHost || request.headers.get('host');
  const fwdProto = request.headers.get('x-forwarded-proto');
  if (host) {
    const proto = fwdProto || (host.startsWith('localhost') ? 'http' : 'https');
    // LAN IP(10./192.168./172.16-31.) 는 dev 서버이므로 http 강제.
    const isLan =
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host) || host.startsWith('localhost');
    return `${isLan ? 'http' : proto}://${host}`;
  }
  return new URL(request.url).origin;
}

function redirectResult(
  request: Request,
  role: 'student' | 'parent',
  category: OrderCategory,
  params: Record<string, string>,
): NextResponse {
  const base = resolveRequestOrigin(request);
  const slug = categorySlug(category);
  const path = role === 'parent' ? `/parent/${slug}/pay/result` : `/student/${slug}/pay/result`;
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  const dest = u.toString();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${dest}"><script>location.replace(${JSON.stringify(dest)})</script></head><body></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

type MealOrderRow = {
  id: string;
  user_id: string;
  student_id: string;
  variant_id: string;
  order_id: string;
  amount: number;
  status: string;
  tid: string | null;
  product_id: string | null;
  option_selections: unknown;
};

type OrderWithVariant = {
  id: string;
  user_id: string;
  student_id: string;
  variant_id: string;
  order_id: string;
  amount: number;
  status: string;
  tid: string | null;
  option_selections: unknown;
  meal_product_variants: { product_id: string } | { product_id: string }[] | null;
};

export async function POST(request: Request) {
  let formData: URLSearchParams;
  try {
    // NICEPay 는 EUC-KR 로 인코딩한 form body 를 POST 한다 (CharSet=euc-kr).
    // Request#formData() 는 UTF-8 디코드만 지원하므로 한글 ResultMsg 가 손상됨 → raw bytes 직접 디코드.
    const buf = new Uint8Array(await request.arrayBuffer());
    formData = parseEucKrFormBody(buf);
  } catch {
    return redirectResult(request, 'student', 'meal', { fail: '1', reason: 'invalid_body' });
  }

  const reqReserved = pickForm(formData, 'ReqReserved', 'reqReserved');
  const role: 'student' | 'parent' = reqReserved === 'p' ? 'parent' : 'student';

  const orderId = pickForm(formData, 'Moid', 'moid');
  const category: OrderCategory = categoryFromOrderId(orderId);

  const authResultCode = pickForm(formData, 'AuthResultCode', 'authResultCode');
  if (authResultCode !== '0000') {
    return redirectResult(request, role, category, {
      fail: '1',
      code: authResultCode || 'unknown',
      // searchParams.set 이 자동으로 URL 인코딩하므로 이중 인코딩 금지.
      msg: pickForm(formData, 'AuthResultMsg', 'authResultMsg') || '',
    });
  }

  const txTid = pickForm(formData, 'TxTid', 'txTid');
  const amountRaw = pickForm(formData, 'Amt', 'amt');
  const authToken = pickForm(formData, 'AuthToken', 'authToken');
  const signature = pickForm(formData, 'Signature', 'signature');
  const respMid = pickForm(formData, 'MID', 'mid');
  const nextAppURL = pickForm(formData, 'NextAppURL', 'nextAppURL');
  const netCancelURL = pickForm(formData, 'NetCancelURL', 'netCancelURL');

  const mid = getNicepayMid();
  const merchantKey = getNicepayMerchantKey();

  if (
    !txTid ||
    !orderId ||
    !amountRaw ||
    !authToken ||
    !signature ||
    !nextAppURL ||
    !netCancelURL
  ) {
    return redirectResult(request, role, category, { fail: '1', reason: 'missing_fields' });
  }

  if (respMid !== mid) {
    return redirectResult(request, role, category, { fail: '1', reason: 'mid_mismatch' });
  }

  const amount = parseInt(amountRaw, 10);
  if (!Number.isFinite(amount)) {
    return redirectResult(request, role, category, { fail: '1', reason: 'invalid_amount' });
  }

  if (!verifyAuthResponseSignature(authToken, respMid, amountRaw, merchantKey, signature)) {
    return redirectResult(request, role, category, { fail: '1', reason: 'invalid_signature' });
  }

  const admin = createAdminClient();

  const { data: order, error: orderErr } = await admin
    .from('meal_orders')
    .select(
      'id, user_id, student_id, variant_id, order_id, amount, status, tid, option_selections, meal_product_variants(product_id)',
    )
    .eq('order_id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    console.error('[nicepay/confirm] order not found', orderErr, orderId);
    return redirectResult(request, role, category, { fail: '1', reason: 'order_not_found' });
  }

  const ordRaw = order as OrderWithVariant;
  const variantJoin = Array.isArray(ordRaw.meal_product_variants)
    ? ordRaw.meal_product_variants[0]
    : ordRaw.meal_product_variants;
  const row: MealOrderRow = {
    id: ordRaw.id,
    user_id: ordRaw.user_id,
    student_id: ordRaw.student_id,
    variant_id: ordRaw.variant_id,
    order_id: ordRaw.order_id,
    amount: ordRaw.amount,
    status: ordRaw.status,
    tid: ordRaw.tid,
    product_id: variantJoin?.product_id ?? null,
    option_selections: ordRaw.option_selections ?? null,
  };

  if (row.status === 'paid' && row.tid) {
    if (row.tid === txTid) {
      return redirectResult(request, role, category, { ok: '1', order: row.id });
    }
    return redirectResult(request, role, category, { fail: '1', reason: 'already_paid' });
  }

  if (row.status !== 'pending') {
    return redirectResult(request, role, category, { fail: '1', reason: 'invalid_order_status' });
  }

  if (row.amount !== amount) {
    return redirectResult(request, role, category, { fail: '1', reason: 'amount_mismatch' });
  }

  // 시간차 가드: createMealOrder 단계에서는 활성이었지만, 결제 진입 직전~승인 호출 직전에
  // 학생이 퇴원 처리된 경우. 이 시점에는 아직 NICEPay 카드 승인(approve) 호출 전이라
  // 별도 망취소 없이 주문만 failed 처리하면 충분하다.
  const { data: studentProfile } = await admin
    .from('profiles')
    .select('withdrawn_at')
    .eq('id', row.student_id)
    .maybeSingle();
  if (studentProfile?.withdrawn_at) {
    const cancelledAt = new Date().toISOString();
    await admin
      .from('meal_orders')
      .update({
        status: 'failed',
        cancel_reason: 'student_withdrawn',
        updated_at: cancelledAt,
      })
      .eq('id', row.id);
    return redirectResult(request, role, category, { fail: '1', reason: 'student_withdrawn' });
  }

  const rawAuth = Object.fromEntries(formData.entries());

  await admin.from('payment_logs').insert({
    order_type: category,
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
      { signal: controller.signal },
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
      approveResult.result.Signature,
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
          order_type: category,
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
      approveResult?.result.ResultMsg || (!approveResult?.httpOk ? '승인 통신 실패' : '승인 거절');
    return redirectResult(request, role, category, {
      fail: '1',
      reason: 'approve_failed',
      msg,
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
    order_type: category,
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

  const slug = categorySlug(category);
  const ordersLink =
    role === 'parent'
      ? `/parent/order?tab=orders&category=${category}`
      : `/student/order?tab=orders&category=${category}`;
  const studentOrdersLink = `/student/order?tab=orders&category=${category}`;
  const title = category === 'exam' ? '모의고사 결제 완료' : '급식 결제 완료';
  const optionSummary =
    category === 'exam'
      ? formatOptionSelectionsSummary(parseOptionSelections(row.option_selections))
      : '';
  const baseBody =
    category === 'exam'
      ? '모의고사 신청이 결제 완료되었습니다.'
      : '급식 신청이 결제 완료되었습니다.';
  const body = optionSummary ? `${baseBody}\n옵션: ${optionSummary}` : baseBody;

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
        link: studentOrdersLink,
      });
    } catch (e) {
      console.error('[nicepay/confirm] student_notification', e);
    }
  }

  const pushData = optionSummary ? { path: ordersLink, optionSummary } : { path: ordersLink };
  const pushDataStudent = optionSummary
    ? { path: studentOrdersLink, optionSummary }
    : { path: studentOrdersLink };
  void sendPushToUser(row.user_id, title, body, pushData).catch((e) =>
    console.error('[nicepay/confirm] push payer', e),
  );
  if (row.student_id !== row.user_id) {
    void sendPushToUser(row.student_id, title, body, pushDataStudent).catch((e) =>
      console.error('[nicepay/confirm] push student', e),
    );
  }

  revalidatePath(`/student/${slug}`);
  revalidatePath(`/parent/${slug}`);
  revalidatePath('/student/order');
  revalidatePath('/parent/order');
  if (row.product_id) {
    revalidatePath(`/student/${slug}/${row.product_id}`);
    revalidatePath(`/parent/${slug}/${row.product_id}`);
  }

  return redirectResult(request, role, category, { ok: '1', order: row.id });
}
