import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isCancelSuccess, netcancelPayment } from '@/lib/nicepay';

type Body = {
  netCancelURL?: string;
  tid?: string;
  authToken?: string;
  mid?: string;
  amt?: string;
  ediDate?: string;
  signData?: string;
};

/**
 * 망취소 (v3) — 인증 직후 승인 단계에서 저장한 ediDate/signData 등으로만 호출 가능.
 * `Authorization: Bearer ${PAYMENTS_INTERNAL_SECRET}` 필요.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYMENTS_INTERNAL_SECRET;
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  if (!secret || auth !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const netCancelURL = body.netCancelURL?.trim();
  const tid = body.tid?.trim();
  const authToken = body.authToken?.trim();
  const mid = body.mid?.trim();
  const amt = body.amt?.trim();
  const ediDate = body.ediDate?.trim();
  const signData = body.signData?.trim();

  if (!netCancelURL || !tid || !authToken || !mid || !amt || !ediDate || !signData) {
    return NextResponse.json(
      {
        error:
          'netCancelURL, tid, authToken, mid, amt, ediDate, signData are required (v3 망취소는 주문번호만으로 불가)',
      },
      { status: 400 }
    );
  }

  const net = await netcancelPayment(netCancelURL, {
    tid,
    authToken,
    mid,
    amt,
    ediDate,
    signData,
  });

  try {
    const admin = createAdminClient();
    await admin.from('payment_logs').insert({
      order_type: 'meal',
      order_id: 'manual-netcancel',
      tid,
      action: 'netcancel',
      amount: parseInt(amt, 10) || null,
      status: isCancelSuccess(net.result) ? 'success' : 'fail',
      result_code: net.result.ResultCode ?? null,
      result_msg: net.result.ResultMsg ?? null,
      raw_response: {
        ...net.result,
        _raw: net.rawText,
      } as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.error('[nicepay/netcancel] log', e);
  }

  return NextResponse.json({
    ...net.result,
    _httpOk: net.httpOk,
    _raw: net.rawText,
  });
}
