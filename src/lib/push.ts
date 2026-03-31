/**
 * Expo Push Notification API 클라이언트 (fetch 직접 호출).
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */

import { createAdminClient } from '@/lib/supabase/server';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

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
  }>
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

function shouldDeactivateToken(ticket: ExpoPushTicket): boolean {
  if (ticket.status !== 'error') return false;
  const code = ticket.details?.error ?? '';
  return (
    code === 'DeviceNotRegistered' ||
    ticket.message?.includes('not a registered push notification recipient') === true
  );
}

async function deactivateTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from('push_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .in('expo_push_token', tokens);

  if (error) {
    console.error('[push] deactivate tokens failed', error);
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
  options?: { sound?: 'default'; badge?: number }
): Promise<void> {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (unique.length === 0) return;

  for (const batch of chunk(unique, BATCH_SIZE)) {
    const messages = batch.map((to) => ({
      to,
      title,
      body,
      sound: options?.sound ?? ('default' as const),
      data: data ?? undefined,
      ...(options?.badge !== undefined ? { badge: options.badge } : {}),
    }));

    const tickets = await postExpoBatch(messages);
    const bad: string[] = [];
    tickets.forEach((ticket, i) => {
      if (shouldDeactivateToken(ticket) && batch[i]) {
        bad.push(batch[i]);
      }
    });
    await deactivateTokens(bad);
  }
}

async function getActiveTokensForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const admin = createAdminClient();
  const unique = [...new Set(userIds)];
  const { data, error } = await admin
    .from('push_tokens')
    .select('expo_push_token')
    .in('user_id', unique)
    .eq('is_active', true);

  if (error) {
    console.error('[push] fetch tokens', error);
    return [];
  }

  const tokens = (data ?? []).map((r) => r.expo_push_token).filter(Boolean);
  return [...new Set(tokens)];
}

/**
 * 단일 사용자의 활성 푸시 토큰으로 발송.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: PushDataPayload
): Promise<void> {
  const tokens = await getActiveTokensForUsers([userId]);
  await sendPush(tokens, title, body, data);
}

/**
 * 여러 사용자에게 동일 알림 발송 (토큰 조회 1회).
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: PushDataPayload
): Promise<void> {
  const tokens = await getActiveTokensForUsers(userIds);
  await sendPush(tokens, title, body, data);
}

/**
 * 지점 소속 학생·학부모에게 발송.
 */
export async function sendPushToBranch(
  branchId: string,
  title: string,
  body: string,
  data?: PushDataPayload
): Promise<void> {
  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id')
    .eq('branch_id', branchId)
    .in('user_type', ['student', 'parent']);

  if (error) {
    console.error('[push] branch profiles', error);
    return;
  }

  const ids = (profiles ?? []).map((p) => p.id);
  await sendPushToUsers(ids, title, body, data);
}
