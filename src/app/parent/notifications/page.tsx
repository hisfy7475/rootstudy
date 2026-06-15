import { getUserNotifications } from '@/lib/actions/notification';
import { createClient } from '@/lib/supabase/server';
import { ParentNotificationsClient } from './notifications-client';

export const PAGE_SIZE = 50;

export default async function ParentNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 배지 카운트는 헤더와 공유하는 store(layout Provider)가 보유 — 여기선 리스트만 SSR.
  const notifications = await getUserNotifications({
    limit: PAGE_SIZE,
    offset: 0,
    excludeTypes: ['chat'],
  });

  return (
    <ParentNotificationsClient
      initialNotifications={notifications}
      userId={user?.id ?? null}
      pageSize={PAGE_SIZE}
    />
  );
}
