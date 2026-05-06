import { notFound } from 'next/navigation';
import { getAnnouncementByIdForViewer } from '@/lib/actions/announcement';
import { AnnouncementDetailView } from '@/components/announcements/AnnouncementDetailView';

export default async function StudentAnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const announcement = await getAnnouncementByIdForViewer(id);
  if (!announcement) notFound();

  return <AnnouncementDetailView announcement={announcement} backHref='/student/announcements' />;
}
