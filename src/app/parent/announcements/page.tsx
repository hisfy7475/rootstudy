import { redirect } from 'next/navigation';
import { getAnnouncements, getUnreadAnnouncementCount } from '@/lib/actions/announcement';
import { AnnouncementsClient } from './announcements-client';

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  // 레거시 푸시 알림(`?id=...`) 호환: 새 라우트로 즉시 redirect.
  const { id } = await searchParams;
  if (id) redirect(`/parent/announcements/${id}`);

  const [announcements, unreadCount] = await Promise.all([
    getAnnouncements(),
    getUnreadAnnouncementCount(),
  ]);

  return (
    <AnnouncementsClient initialAnnouncements={announcements} initialUnreadCount={unreadCount} />
  );
}
