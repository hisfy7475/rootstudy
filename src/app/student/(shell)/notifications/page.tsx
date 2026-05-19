import { getStudentNotifications, getUnreadNotificationCount } from '@/lib/actions/notification';
import { createClient } from '@/lib/supabase/server';
import { NotificationsClient } from './notifications-client';

export const PAGE_SIZE = 50;

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [notifications, unreadCount] = await Promise.all([
    getStudentNotifications({ limit: PAGE_SIZE, offset: 0, excludeTypes: ['chat'] }),
    getUnreadNotificationCount({ excludeTypes: ['chat'] }),
  ]);

  return (
    <NotificationsClient
      initialNotifications={notifications}
      initialUnreadCount={unreadCount}
      userId={user?.id ?? null}
      pageSize={PAGE_SIZE}
    />
  );
}
