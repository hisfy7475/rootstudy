import Link from 'next/link';
import { getMentorsForAdmin } from '@/lib/actions/mentoring';
import { AdminMentorsClient } from './mentors-client';

export default async function AdminMentorsPage() {
  const mentors = await getMentorsForAdmin();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin/mentoring"
            className="text-muted-foreground hover:text-foreground mb-2 inline-block text-sm"
          >
            ← 주간 일정
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">멘토 관리</h1>
          <p className="text-muted-foreground mt-1 text-sm">멘토 등록·수정·활성 여부</p>
        </div>
      </div>

      <AdminMentorsClient initialMentors={mentors} />
    </div>
  );
}
