import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  getNicepayMerchantKey,
  getNicepayMid,
  verifyWebhookStyleSignature,
} from '@/lib/nicepay';

function okResponse(): NextResponse {
  return new NextResponse('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

type WebhookBody = {
  ResultCode?: string;
  resultCode?: string;
  ResultMsg?: string;
  TID?: string;
  tid?: string;
  Moid?: string;
  moid?: string;
  Amt?: string;
  amt?: string | number;
  Signature?: string;
  signature?: string;
  MID?: string;
  mid?: string;
  [key: string]: unknown;
}

function pickStr(body: WebhookBody, ...keys: string[]): string {
  for (const k of keys) {
    const v = body[k];
    if (v != null && String(v).length > 0) return String(v);
  }
  return '';
}

export async function POST(request: Request) {
  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return okResponse();
  }

  const tid = pickStr(body, 'TID', 'tid');
  const moid = pickStr(body, 'Moid', 'moid');
  const amtRaw = pickStr(body, 'Amt', 'amt');
  const signature = pickStr(body, 'Signature', 'signature');
  const mid = pickStr(body, 'MID', 'mid') || getNicepayMid();
  const merchantKey = getNicepayMerchantKey();

  if (tid && amtRaw && signature && merchantKey && mid) {
    const ok = verifyWebhookStyleSignature(tid, amtRaw, mid, merchantKey, signature);
    if (!ok) {
      console.warn('[nicepay/webhook] invalid signature', moid);
      return okResponse();
    }
  }

  const resultCode = pickStr(body, 'ResultCode', 'resultCode');
  const resultMsg = pickStr(body, 'ResultMsg', 'resultMsg');
  const amtNum = amtRaw ? parseInt(amtRaw, 10) : NaN;

  try {
    const admin = createAdminClient();
    await admin.from('payment_logs').insert({
      order_type: 'meal',
      order_id: moid || 'unknown',
      tid: tid || null,
      action: 'webhook',
      amount: Number.isFinite(amtNum) ? amtNum : null,
      status:
        resultCode === '3001' || resultCode === '2001' || resultCode === '0000'
          ? 'success'
          : 'fail',
      result_code: resultCode || null,
      result_msg: resultMsg || null,
      raw_response: body as Record<string, unknown>,
    });
  } catch (e) {
    console.error('[nicepay/webhook] log insert', e);
  }

  return okResponse();
}
