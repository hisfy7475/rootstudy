import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getAdminMentoringSlotDetail,
  getMentoringApplicationsForSlotAdmin,
  getMentorsForAdmin,
} from '@/lib/actions/mentoring';
import { AdminSlotDetailClient } from './slot-detail-client';

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminMentoringSlotDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [slot, applications, mentors] = await Promise.all([
    getAdminMentoringSlotDetail(id),
    getMentoringApplicationsForSlotAdmin(id),
    getMentorsForAdmin(),
  ]);

  if (!slot) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <Link href="/admin/mentoring" className="text-muted-foreground hover:text-foreground mb-2 inline-block text-sm">
          ← 주간 일정
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">슬롯 상세</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {slot.date} {String(slot.start_time).slice(0, 5)}–{String(slot.end_time).slice(0, 5)} ·{' '}
          {slot.mentors?.name ?? '멘토'}
        </p>
      </div>

      <AdminSlotDetailClient slot={slot} initialApplications={applications} mentors={mentors} />
    </div>
  );
}
