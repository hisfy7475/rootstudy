import { getAnnouncementsForAdmin } from '@/lib/actions/announcement';
import { getAlimtalkConfig } from '@/lib/actions/notification';
import { AnnouncementsClient } from './announcements-client';

export default async function AnnouncementsManagementPage() {
  const [announcements, alimtalkConfig] = await Promise.all([
    getAnnouncementsForAdmin(),
    getAlimtalkConfig(),
  ]);

  return (
    <AnnouncementsClient
      initialAnnouncements={announcements}
      alimtalkConfigured={alimtalkConfig.isConfigured}
    />
  );
}
