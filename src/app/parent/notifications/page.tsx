import { getUserNotifications, getUnreadUserNotificationCount } from '@/lib/actions/notification';
import { createClient } from '@/lib/supabase/server';
import { ParentNotificationsClient } from './notifications-client';

export const PAGE_SIZE = 50;

export default async function ParentNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [notifications, unreadCount] = await Promise.all([
    getUserNotifications({ limit: PAGE_SIZE, offset: 0, excludeTypes: ['chat'] }),
    getUnreadUserNotificationCount({ excludeTypes: ['chat'] }),
  ]);

  return (
    <ParentNotificationsClient
      initialNotifications={notifications}
      initialUnreadCount={unreadCount}
      userId={user?.id ?? null}
      pageSize={PAGE_SIZE}
    />
  );
}
