import { getStudentNotifications, getUnreadNotificationCount } from '@/lib/actions/notification';
import { NotificationsClient } from './notifications-client';

export default async function NotificationsPage() {
  const [notifications, unreadCount] = await Promise.all([
    getStudentNotifications(),
    getUnreadNotificationCount(),
  ]);

  return (
    <NotificationsClient
      initialNotifications={notifications}
      initialUnreadCount={unreadCount}
    />
  );
}
