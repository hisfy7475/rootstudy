import { getNotifications } from '@/lib/actions/admin';
import { NotificationsClient } from './notifications-client';

export default async function NotificationsManagementPage() {
  const notifications = await getNotifications();

  return <NotificationsClient initialNotifications={notifications} />;
}
