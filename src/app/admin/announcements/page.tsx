import { getAnnouncementsForAdmin } from '@/lib/actions/announcement';
import { AnnouncementsClient } from './announcements-client';

export default async function AnnouncementsManagementPage() {
  const announcements = await getAnnouncementsForAdmin();

  return <AnnouncementsClient initialAnnouncements={announcements} />;
}
