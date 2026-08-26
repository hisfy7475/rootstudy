/**
 * Expo Push Notification API 클라이언트 (fetch 직접 호출).
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * 발송 1건(토큰 단위)마다 push_delivery_log 에 기록을 남긴다. Expo 는 단말 도달 실패
 * (DeviceNotRegistered = 앱 삭제/알림 끔/토큰 만료)를 대부분 응답(ticket)이 아니라
 * 15분쯤 뒤 조회하는 영수증(receipt)으로 알려주므로, 확정은 push-receipts 크론이
 * sweepPushReceipts() 로 처리한다.
 */

import { createAdminClient } from '@/lib/supabase/server';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const BATCH_SIZE = 100;

/** 영수증은 발송 직후엔 아직 없다. Expo 권장대로 15분 이상 지난 건만 조회한다. */
const RECEIPT_READY_MINUTES = 15;
/** Expo 는 영수증을 24시간만 보관한다. 그 뒤로는 확인 불가(unknown)로 종결. */
const RECEIPT_EXPIRE_HOURS = 24;
/** getReceipts 는 1회 1000개까지 허용. 여유를 두고 300개씩 끊는다. */
const RECEIPT_LOOKUP_BATCH = 300;
/** 크론 1회 실행에서 확정할 최대 건수. */
const RECEIPT_SWEEP_LIMIT = 900;
/** 발송 로그 보관 기간. */
const LOG_RETENTION_DAYS = 30;

export type PushDataPayload = {
  path?: string;
  type?: string;
  [key: string]: string | undefined;
};

type ExpoPushTicketOk = { status: 'ok'; id: string };
type ExpoPushTicketErr = {
  status: 'error';
  message: string;
  details?: { error?: string };
};
type ExpoPushTicket = ExpoPushTicketOk | ExpoPushTicketErr;

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
};

type ExpoPushReceipt = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

type ExpoReceiptResponse = {
  data?: Record<string, ExpoPushReceipt>;
};

/** 토큰 + 소유자. 발송 로그에 user_id 를 남기려고 함께 들고 다닌다. */
type PushTarget = { token: string; userId: string | null };

type DeliveryLogRow = {
  user_id: string | null;
  expo_push_token: string;
  title: string;
  ticket_id: string | null;
  status: 'accepted' | 'ticket_error';
  error_code: string | null;
  error_message: string | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function postExpoBatch(
  messages: Array<{
    to: string;
    title: string;
    body: string;
    sound?: 'default';
    data?: PushDataPayload;
    badge?: number;
  }>,
): Promise<ExpoPushTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    console.error('[push] Expo API HTTP error', res.status, await res.text());
    return [];
  }

  const json = (await res.json()) as ExpoPushResponse;
  return json.data ?? [];
}

/** 앱 삭제·알림 끔·토큰 만료 — 다시 등록되기 전까지 발송해도 소용없는 상태. */
function isDeviceNotRegistered(code: string | undefined, message: string | undefined): boolean {
  return (
    code === 'DeviceNotRegistered' ||
    message?.includes('not a registered push notification recipient') === true
  );
}

function shouldDeactivateToken(ticket: ExpoPushTicket): boolean {
  if (ticket.status !== 'error') return false;
  return isDeviceNotRegistered(ticket.details?.error, ticket.message);
}

/**
 * 죽은 토큰 비활성화. 같은 토큰이 여러 계정(한 기기에 학생·학부모 로그인)에 물려 있어도
 * 기기가 죽은 것이므로 user_id 필터 없이 토큰 기준으로 모두 내린다.
 */
async function deactivateTokens(tokens: string[]): Promise<number> {
  const unique = [...new Set(tokens)];
  if (unique.length === 0) return 0;
  const admin = createAdminClient();
  const { error, count } = await admin
    .from('push_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() }, { count: 'exact' })
    .in('expo_push_token', unique);

  if (error) {
    console.error('[push] deactivate tokens failed', error);
    return 0;
  }
  return count ?? 0;
}

/** 발송 로그 적재. 로그 실패가 발송을 막으면 안 되므로 삼킨다. */
async function logDeliveries(rows: DeliveryLogRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('push_delivery_log').insert(rows);
    if (error) console.error('[push] delivery log insert failed', error);
  } catch (e) {
    console.error('[push] delivery log insert threw', e);
  }
}

async function sendPushToTargets(
  targets: PushTarget[],
  title: string,
  body: string,
  data?: PushDataPayload,
  options?: { sound?: 'default'; badge?: number },
): Promise<void> {
  // 같은 토큰이 두 계정에 물려 있으면 한 번만 보낸다(기기 기준 중복 알림 방지).
  const seen = new Set<string>();
  const unique = targets.filter((t) => {
    if (!t.token || seen.has(t.token)) return false;
    seen.add(t.token);
    return true;
  });
  if (unique.length === 0) return;

  for (const batch of chunk(unique, BATCH_SIZE)) {
    const messages = batch.map((t) => ({
      to: t.token,
      title,
      body,
      sound: options?.sound ?? ('default' as const),
      data: data ?? undefined,
      ...(options?.badge !== undefined ? { badge: options.badge } : {}),
    }));

    const tickets = await postExpoBatch(messages);
    const bad: string[] = [];
    const logs: DeliveryLogRow[] = [];

    batch.forEach((target, i) => {
      const ticket = tickets[i];
      const base = {
        user_id: target.userId,
        expo_push_token: target.token,
        title,
      };

      if (!ticket) {
        // HTTP 오류 등으로 티켓 자체를 못 받은 경우. 접수 실패로 남긴다.
        logs.push({
          ...base,
          ticket_id: null,
          status: 'ticket_error',
          error_code: 'no_ticket',
          error_message: 'Expo API 응답에 티켓이 없습니다.',
        });
        return;
      }

      if (ticket.status === 'ok') {
        logs.push({
          ...base,
          ticket_id: ticket.id,
          status: 'accepted',
          error_code: null,
          error_message: null,
        });
        return;
      }

      logs.push({
        ...base,
        ticket_id: null,
        status: 'ticket_error',
        error_code: ticket.details?.error ?? null,
        error_message: ticket.message ?? null,
      });
      if (shouldDeactivateToken(ticket)) bad.push(target.token);
    });

    await logDeliveries(logs);
    await deactivateTokens(bad);
  }
}

/**
 * Expo 푸시 토큰 배열에 직접 발송.
 */
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data?: PushDataPayload,
  options?: { sound?: 'default'; badge?: number },
): Promise<void> {
  const targets = tokens.filter(Boolean).map((token) => ({ token, userId: null }));
  await sendPushToTargets(targets, title, body, data, options);
}

async function getActiveTargetsForUsers(userIds: string[]): Promise<PushTarget[]> {
  if (userIds.length === 0) return [];
  const admin = createAdminClient();
  const unique = [...new Set(userIds)];
  const { data, error } = await admin
    .from('push_tokens')
    .select('expo_push_token, user_id')
    .in('user_id', unique)
    .eq('is_active', true);

  if (error) {
    console.error('[push] fetch tokens', error);
    return [];
  }

  return (data ?? [])
    .filter((r) => Boolean(r.expo_push_token))
    .map((r) => ({ token: r.expo_push_token as string, userId: (r.user_id as string) ?? null }));
}

/**
 * 단일 사용자의 활성 푸시 토큰으로 발송.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: PushDataPayload,
): Promise<void> {
  const targets = await getActiveTargetsForUsers([userId]);
  await sendPushToTargets(targets, title, body, data);
}

/**
 * 여러 사용자에게 동일 알림 발송 (토큰 조회 1회).
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: PushDataPayload,
): Promise<void> {
  const targets = await getActiveTargetsForUsers(userIds);
  await sendPushToTargets(targets, title, body, data);
}

/**
 * 지점 소속 학생·학부모에게 발송.
 */
export async function sendPushToBranch(
  branchId: string,
  title: string,
  body: string,
  data?: PushDataPayload,
): Promise<void> {
  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id')
    .eq('branch_id', branchId)
    .is('withdrawn_at', null)
    .in('user_type', ['student', 'parent']);

  if (error) {
    console.error('[push] branch profiles', error);
    return;
  }

  const ids = (profiles ?? []).map((p) => p.id);
  await sendPushToUsers(ids, title, body, data);
}

async function postExpoReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids }),
  });

  if (!res.ok) {
    console.error('[push] Expo receipts HTTP error', res.status, await res.text());
    return {};
  }

  const json = (await res.json()) as ExpoReceiptResponse;
  return json.data ?? {};
}

export type PushReceiptSweepResult = {
  pending: number;
  delivered: number;
  failed: number;
  unknown: number;
  deactivatedTokens: number;
  purged: number;
};

/**
 * 미확정 발송 로그의 Expo 영수증을 조회해 상태를 확정한다 (push-receipts 크론 전용).
 *
 * - delivered: 푸시 서비스(APNs/FCM)까지 전달 완료
 * - failed   : 실패. DeviceNotRegistered 면 해당 토큰을 즉시 비활성화한다
 * - unknown  : 24시간이 지나 Expo 가 영수증을 만료시킨 건(재조회해도 안 나오므로 종결)
 *
 * 마지막으로 보관 기간(30일)이 지난 로그를 정리한다.
 */
export async function sweepPushReceipts(): Promise<PushReceiptSweepResult> {
  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const readyBefore = new Date(now - RECEIPT_READY_MINUTES * 60_000).toISOString();
  const expiredBefore = new Date(now - RECEIPT_EXPIRE_HOURS * 3_600_000).toISOString();

  const result: PushReceiptSweepResult = {
    pending: 0,
    delivered: 0,
    failed: 0,
    unknown: 0,
    deactivatedTokens: 0,
    purged: 0,
  };

  const { data: pending, error } = await admin
    .from('push_delivery_log')
    .select('id, ticket_id, expo_push_token, created_at')
    .eq('status', 'accepted')
    .not('ticket_id', 'is', null)
    .lt('created_at', readyBefore)
    .order('created_at', { ascending: true })
    .limit(RECEIPT_SWEEP_LIMIT);

  if (error) {
    console.error('[push] receipt sweep fetch failed', error);
  }

  const rows = (pending ?? []) as Array<{
    id: number;
    ticket_id: string;
    expo_push_token: string;
    created_at: string;
  }>;
  result.pending = rows.length;

  if (rows.length > 0) {
    const deliveredIds: number[] = [];
    // (error_code, error_message) 조합별로 묶어서 update 횟수를 줄인다.
    const failedGroups = new Map<string, { code: string | null; message: string | null; ids: number[] }>();
    const deadTokens: string[] = [];
    const expiredIds: number[] = [];

    for (const batch of chunk(rows, RECEIPT_LOOKUP_BATCH)) {
      const receipts = await postExpoReceipts(batch.map((r) => r.ticket_id));

      for (const row of batch) {
        const receipt = receipts[row.ticket_id];

        if (!receipt) {
          // 아직 준비 안 됐거나(다음 실행에서 재시도) 만료됐거나(종결).
          if (row.created_at < expiredBefore) expiredIds.push(row.id);
          continue;
        }

        if (receipt.status === 'ok') {
          deliveredIds.push(row.id);
          continue;
        }

        const code = receipt.details?.error ?? null;
        const message = receipt.message ?? null;
        const key = `${code ?? ''} ${message ?? ''}`;
        const group = failedGroups.get(key);
        if (group) group.ids.push(row.id);
        else failedGroups.set(key, { code, message, ids: [row.id] });

        if (isDeviceNotRegistered(code ?? undefined, message ?? undefined)) {
          deadTokens.push(row.expo_push_token);
        }
      }
    }

    if (deliveredIds.length > 0) {
      const { error: upErr } = await admin
        .from('push_delivery_log')
        .update({ status: 'delivered', receipt_checked_at: nowIso })
        .in('id', deliveredIds);
      if (upErr) console.error('[push] mark delivered failed', upErr);
      else result.delivered = deliveredIds.length;
    }

    for (const group of failedGroups.values()) {
      const { error: upErr } = await admin
        .from('push_delivery_log')
        .update({
          status: 'failed',
          error_code: group.code,
          error_message: group.message,
          receipt_checked_at: nowIso,
        })
        .in('id', group.ids);
      if (upErr) console.error('[push] mark failed failed', upErr);
      else result.failed += group.ids.length;
    }

    if (expiredIds.length > 0) {
      const { error: upErr } = await admin
        .from('push_delivery_log')
        .update({ status: 'unknown', receipt_checked_at: nowIso })
        .in('id', expiredIds);
      if (upErr) console.error('[push] mark unknown failed', upErr);
      else result.unknown = expiredIds.length;
    }

    result.deactivatedTokens = await deactivateTokens(deadTokens);
  }

  const purgeBefore = new Date(now - LOG_RETENTION_DAYS * 86_400_000).toISOString();
  const { error: purgeErr, count: purgedCount } = await admin
    .from('push_delivery_log')
    .delete({ count: 'exact' })
    .lt('created_at', purgeBefore);
  if (purgeErr) console.error('[push] purge old logs failed', purgeErr);
  else result.purged = purgedCount ?? 0;

  return result;
}
