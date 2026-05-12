import { createHash, randomUUID } from 'crypto';
import { encodeFormUrlEucKr, truncateBytesForEucKr } from './nicepay-encoding';

/**
 * NICEPay PG Web v3 (developers.nicepay.co.kr)
 * - 결제창: https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js + goPay(form)
 * - 승인: 인증 응답의 NextAppURL 로 form POST (EdiType=JSON)
 * - 망취소: NetCancelURL
 * - 취소: pg-api.nicepay.co.kr/webapi/cancel_process.jsp
 */

export const NICEPAY_PGWEB_SCRIPT_SRC =
  'https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js';

const CANCEL_PROCESS_URL = 'https://pg-api.nicepay.co.kr/webapi/cancel_process.jsp';

/** 카드 승인 성공 ResultCode */
export const NICEPAY_RESULT_CARD_APPROVED = '3001';

/** 취소·망취소 성공 ResultCode (문서 예시) */
export const NICEPAY_RESULT_CANCEL_OK = '2001';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** KST 기준 YYYYMMDDHHmmss (나이스페이 EdiDate) */
export function formatNicepayEdiDate(date: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

export function getNicepayMid(): string {
  return process.env.NICEPAY_MID ?? process.env.NEXT_PUBLIC_NICEPAY_MID ?? '';
}

export function getNicepayMerchantKey(): string {
  return process.env.NICEPAY_MERCHANT_KEY ?? '';
}

/** 결제창 요청 SignData: hex(sha256(EdiDate + MID + Amt + MerchantKey)) */
export function buildPaymentWindowSignData(
  ediDate: string,
  mid: string,
  amt: string,
  merchantKey: string,
): string {
  return sha256Hex(ediDate + mid + amt + merchantKey);
}

/**
 * 인증 응답 Signature 검증: hex(sha256(AuthToken + MID + Amt + MerchantKey))
 */
export function verifyAuthResponseSignature(
  authToken: string,
  mid: string,
  amt: string,
  merchantKey: string,
  signature: string,
): boolean {
  const expected = sha256Hex(authToken + mid + amt + merchantKey);
  return expected.toLowerCase() === signature.toLowerCase();
}

/** 승인 요청 SignData: hex(sha256(AuthToken + MID + Amt + EdiDate + MerchantKey)) */
export function buildApproveSignData(
  authToken: string,
  mid: string,
  amt: string,
  ediDate: string,
  merchantKey: string,
): string {
  return sha256Hex(authToken + mid + amt + ediDate + merchantKey);
}

/** 취소 요청 SignData: hex(sha256(MID + CancelAmt + EdiDate + MerchantKey)) */
export function buildCancelSignData(
  mid: string,
  cancelAmt: string,
  ediDate: string,
  merchantKey: string,
): string {
  return sha256Hex(mid + cancelAmt + ediDate + merchantKey);
}

/**
 * 승인 응답 Signature: hex(sha256(TID + MID + Amt + MerchantKey)) — 선택 검증
 */
export function verifyApproveResponseSignature(
  tid: string,
  mid: string,
  amt: string,
  merchantKey: string,
  signature: string | undefined,
): boolean {
  if (!signature) return true;
  const expected = sha256Hex(tid + mid + amt + merchantKey);
  return expected.toLowerCase() === signature.toLowerCase();
}

export function generateMealOrderId(): string {
  return `MEAL-${randomUUID().replace(/-/g, '')}`;
}

export function generateExamOrderId(): string {
  return `EXAM-${randomUUID().replace(/-/g, '')}`;
}

export type NicepayV3Response = {
  ResultCode?: string;
  ResultMsg?: string;
  TID?: string;
  Moid?: string;
  Amt?: string;
  PayMethod?: string;
  Signature?: string;
  [key: string]: string | undefined;
};

function parseNicepayBody(text: string): NicepayV3Response {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    const raw = JSON.parse(trimmed) as Record<string, unknown>;
    const out: NicepayV3Response = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = v == null ? undefined : String(v);
    }
    return out;
  } catch {
    const out: NicepayV3Response = {};
    const params = new URLSearchParams(trimmed);
    params.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
}

function formEncode(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export type ApprovePaymentResult = {
  result: NicepayV3Response;
  rawText: string;
  ediDate: string;
  signData: string;
  httpOk: boolean;
};

/**
 * 승인 API — nextAppUrl 로 POST (인증 응답의 NextAppURL)
 */
export async function approvePayment(
  nextAppUrl: string,
  args: {
    tid: string;
    authToken: string;
    mid: string;
    amt: string;
    merchantKey: string;
  },
  options?: { signal?: AbortSignal },
): Promise<ApprovePaymentResult> {
  const ediDate = formatNicepayEdiDate();
  const signData = buildApproveSignData(
    args.authToken,
    args.mid,
    args.amt,
    ediDate,
    args.merchantKey,
  );

  const body = formEncode({
    TID: args.tid,
    AuthToken: args.authToken,
    MID: args.mid,
    Amt: args.amt,
    EdiDate: ediDate,
    SignData: signData,
    CharSet: 'utf-8',
    EdiType: 'JSON',
  });

  let httpOk = false;
  let rawText = '';
  try {
    const res = await fetch(nextAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body,
      signal: options?.signal,
    });
    httpOk = res.ok;
    rawText = await res.text();
  } catch {
    rawText = '';
    httpOk = false;
  }

  return {
    result: parseNicepayBody(rawText),
    rawText,
    ediDate,
    signData,
    httpOk,
  };
}

export type NetcancelPaymentResult = {
  result: NicepayV3Response;
  rawText: string;
  httpOk: boolean;
};

/**
 * 망취소 — 인증 응답의 NetCancelURL, 승인과 동일 SignData/EdiDate 에 NetCancel=1
 */
export async function netcancelPayment(
  netCancelUrl: string,
  args: {
    tid: string;
    authToken: string;
    mid: string;
    amt: string;
    ediDate: string;
    signData: string;
  },
  options?: { signal?: AbortSignal },
): Promise<NetcancelPaymentResult> {
  const body = formEncode({
    TID: args.tid,
    AuthToken: args.authToken,
    MID: args.mid,
    Amt: args.amt,
    EdiDate: args.ediDate,
    SignData: args.signData,
    NetCancel: '1',
    CharSet: 'utf-8',
    EdiType: 'JSON',
  });

  let httpOk = false;
  let rawText = '';
  try {
    const res = await fetch(netCancelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body,
      signal: options?.signal,
    });
    httpOk = res.ok;
    rawText = await res.text();
  } catch {
    rawText = '';
    httpOk = false;
  }

  return { result: parseNicepayBody(rawText), rawText, httpOk };
}

export function isCardApproveSuccess(res: NicepayV3Response): boolean {
  return String(res.ResultCode ?? '') === NICEPAY_RESULT_CARD_APPROVED;
}

export function isCancelSuccess(res: NicepayV3Response): boolean {
  return String(res.ResultCode ?? '') === NICEPAY_RESULT_CANCEL_OK;
}

export type CancelPaymentResult = {
  result: NicepayV3Response;
  rawText: string;
  httpOk: boolean;
};

/**
 * 승인 취소 API (전액)
 */
export async function cancelPayment(
  args: {
    tid: string;
    mid: string;
    merchantKey: string;
    /** 숫자만 문자열 (예 "10000") */
    cancelAmt: string;
    /** 가맹점 주문번호 — meal_orders.order_id 사용 (meal/exam 공용) */
    moid: string;
    cancelMsg: string;
    partialCancelCode?: '0' | '1';
  },
  options?: { signal?: AbortSignal },
): Promise<CancelPaymentResult> {
  const ediDate = formatNicepayEdiDate();
  const signData = buildCancelSignData(args.mid, args.cancelAmt, ediDate, args.merchantKey);

  // CancelMsg 는 한글 가능. NICEPay 가맹점이 EUC-KR 기준이라 UTF-8 전송 시 깨짐 발생 (GoodsName 과 동일 패턴).
  // body 전체를 EUC-KR percent-encoding 으로 전송 + Content-Type charset=euc-kr 명시.
  // ASCII 필드(TID/MID/Amt 등)는 영향 없음. CancelMsg 만 안전 길이로 자른 후 보낸다.
  // encodeFormUrlEucKr 결과는 모두 ASCII (percent-encoded) string 이라 그대로 fetch body 로 전달.
  const safeCancelMsg = truncateBytesForEucKr(args.cancelMsg, 100);
  const body = encodeFormUrlEucKr({
    TID: args.tid,
    MID: args.mid,
    Moid: args.moid,
    CancelAmt: args.cancelAmt,
    CancelMsg: safeCancelMsg,
    PartialCancelCode: args.partialCancelCode ?? '0',
    EdiDate: ediDate,
    SignData: signData,
    CharSet: 'euc-kr',
    EdiType: 'JSON',
  });

  let httpOk = false;
  let rawText = '';
  try {
    const res = await fetch(CANCEL_PROCESS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=euc-kr',
      },
      body,
      signal: options?.signal,
    });
    httpOk = res.ok;
    rawText = await res.text();
  } catch {
    rawText = '';
    httpOk = false;
  }

  return { result: parseNicepayBody(rawText), rawText, httpOk };
}

/**
 * 결제창용 서버에서만 계산 가능한 필드 + 공개 MID (meal/exam 공용).
 * 함수명은 historical — meal_orders 테이블을 공유하므로 그대로 유지.
 */
export function buildMealPaymentWindowParams(input: {
  orderId: string;
  amount: number;
  goodsName: string;
}): {
  mid: string;
  ediDate: string;
  signData: string;
  amt: string;
  moid: string;
  goodsNameShort: string;
} | null {
  const mid = getNicepayMid();
  const merchantKey = getNicepayMerchantKey();
  if (!mid || !merchantKey) return null;

  const amt = String(Math.trunc(input.amount));
  const ediDate = formatNicepayEdiDate();
  const signData = buildPaymentWindowSignData(ediDate, mid, amt, merchantKey);
  // EUC-KR 바이트 기준 40 바이트로 잘라 NICEPay 측 디코딩 깨짐 방지.
  // 문자 수 기준 slice(0, 40) 는 멀티바이트 한글 + 특수문자 케이스에서 NICEPay 응답이 손상됐던 원인.
  const goodsNameShort = truncateBytesForEucKr(input.goodsName, 40);

  return {
    mid,
    ediDate,
    signData,
    amt,
    moid: input.orderId,
    goodsNameShort,
  };
}

/** 결제통보 등: hex(sha256(TID + MID + Amt + MerchantKey)) */
export function verifyWebhookStyleSignature(
  tid: string,
  amt: string,
  mid: string,
  merchantKey: string,
  signature: string,
): boolean {
  const expected = sha256Hex(tid + mid + amt + merchantKey);
  return expected.toLowerCase() === signature.toLowerCase();
}

export function getNicepayCancelProcessUrl(): string {
  return CANCEL_PROCESS_URL;
}
