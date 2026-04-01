import { getAnnouncements, getUnreadAnnouncementCount } from '@/lib/actions/announcement';
import { AnnouncementsClient } from './announcements-client';

export default async function AnnouncementsPage() {
  const [announcements, unreadCount] = await Promise.all([
    getAnnouncements(),
    getUnreadAnnouncementCount(),
  ]);

  return (
    <AnnouncementsClient
      initialAnnouncements={announcements}
      initialUnreadCount={unreadCount}
    />
  );
}
