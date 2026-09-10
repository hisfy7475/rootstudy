/**
 * CAPS 동기화 장애 경보.
 *
 * caps-sync 크론이 연속으로 실패하면 그동안 찍힌 입·퇴실이 앱에 반영되지 않는다(기록 유실은 없고
 * 복구 시 원래 시각으로 백필된다). 2026-09-09 압구정 문의 때는 18분 무증상으로 지점이 먼저 발견했다.
 * 연속 실패가 임계치에 닿으면 지점 공용 알림 + 관리자 푸시로 알리고, 복구 시에도 한 번 알린다.
 *
 * 수신자: CAPS 서버는 전 지점 공용이라 활성 지점 전부(branch_notifications 지점당 1행) +
 * 관리자 전원(슈퍼 포함) 푸시.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUsers } from '@/lib/push';

// 프로젝트 전역이 비타입드 createClient<any> 를 쓰므로 동일하게 둔다(penalty.ts 와 같은 방식).
type Client = SupabaseClient;

/** 이 횟수 연속 실패하면 1차 경보. (1회 실행 ≈ 1분) */
export const SYNC_ALERT_THRESHOLD = 3;
/** 장기 장애 중엔 이 간격(연속 실패 횟수)마다 재경보. */
const SYNC_ALERT_REPEAT_EVERY = 15;
/** 연속 실패 판정 시 살펴볼 최근 로그 수. 이보다 긴 장애는 상한에서 잘린다(재경보 주기에만 영향). */
const STREAK_LOOKBACK = 120;

const ALERT_LINK = '/admin/attendance';

export type SyncFailureStreak = {
  /** 최신 로그부터 이어지는 error 행 수. */
  count: number;
  /** 연속 실패의 첫 실행 시각(ISO). 실패가 없으면 null. */
  since: string | null;
};

/** caps_sync_log 맨 앞(최신)에서부터 이어지는 error 행 수와 시작 시각. */
export async function getFailureStreak(supabase: Client): Promise<SyncFailureStreak> {
  const { data, error } = await supabase
    .from('caps_sync_log')
    .select('synced_at, status')
    .order('synced_at', { ascending: false })
    .limit(STREAK_LOOKBACK);

  if (error || !data) {
    if (error) console.error('[caps-sync-alert] streak query', error);
    return { count: 0, since: null };
  }

  let count = 0;
  let since: string | null = null;
  for (const row of data) {
    if (row.status !== 'error') break;
    count += 1;
    since = row.synced_at;
  }
  return { count, since };
}

/** 이번 실패까지 포함한 연속 실패 횟수로 경보 여부 판정. 임계치에서 1회, 이후 일정 간격마다. */
export function shouldAlertOnFailure(consecutive: number): boolean {
  if (consecutive < SYNC_ALERT_THRESHOLD) return false;
  return (consecutive - SYNC_ALERT_THRESHOLD) % SYNC_ALERT_REPEAT_EVERY === 0;
}

const kstTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatSince(since: string | null): string {
  return since ? kstTimeFormatter.format(new Date(since)) : '조금 전';
}

async function notifyAllAdmins(supabase: Client, title: string, message: string): Promise<void> {
  const { data: branches, error: bErr } = await supabase
    .from('branches')
    .select('id')
    .eq('is_active', true);
  if (bErr) console.error('[caps-sync-alert] branches query', bErr);

  if (branches?.length) {
    const { error } = await supabase.from('branch_notifications').insert(
      branches.map((b) => ({
        branch_id: b.id,
        type: 'system',
        title,
        message,
        link: ALERT_LINK,
      })),
    );
    if (error) console.error('[caps-sync-alert] branch_notifications insert', error);
  }

  const { data: admins, error: aErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .is('withdrawn_at', null);
  if (aErr) console.error('[caps-sync-alert] admins query', aErr);

  if (admins?.length) {
    await sendPushToUsers(
      admins.map((a) => a.id),
      title,
      message,
      { path: ALERT_LINK },
    ).catch((e) => console.error('[caps-sync-alert] push', e));
  }
}

/** 연속 실패 경보. streak 는 이번 실패를 포함한 값. */
export async function notifySyncFailure(
  supabase: Client,
  streak: SyncFailureStreak,
): Promise<void> {
  const title = '출입 기록 수집 지연';
  const message =
    `지문인식기 출입 기록 수집이 ${formatSince(streak.since)}부터 약 ${streak.count}분째 실패하고 있습니다. ` +
    '그동안의 입·퇴실은 앱에 반영되지 않지만 기록은 유실되지 않으며, 복구되면 원래 시각으로 자동 반영됩니다.';
  await notifyAllAdmins(supabase, title, message);
}

/** 복구 알림. streak 는 복구 직전까지의 연속 실패. */
export async function notifySyncRecovered(
  supabase: Client,
  streak: SyncFailureStreak,
  recordsSynced: number,
): Promise<void> {
  const title = '출입 기록 수집 복구';
  const message =
    `${formatSince(streak.since)}부터 약 ${streak.count}분간 지연됐던 출입 기록 수집이 복구되었습니다. ` +
    (recordsSynced > 0
      ? `밀려 있던 입·퇴실 ${recordsSynced}건이 원래 시각으로 반영되었습니다.`
      : '지연 중에 새로 찍힌 입·퇴실은 없었습니다.');
  await notifyAllAdmins(supabase, title, message);
}
