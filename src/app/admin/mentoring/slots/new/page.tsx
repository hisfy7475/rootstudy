import Link from 'next/link';
import { getMentorsForAdmin } from '@/lib/actions/mentoring';
import { getMondayOfWeekKST } from '@/lib/mentoring-calendar';
import { getTodayKST } from '@/lib/utils';
import { AdminNewSlotClient } from './new-slot-client';

export default async function AdminNewMentoringSlotPage() {
  const mentors = await getMentorsForAdmin();
  const defaultWeekMonday = getMondayOfWeekKST(getTodayKST());

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div>
        <Link href="/admin/mentoring" className="text-muted-foreground hover:text-foreground mb-2 inline-block text-sm">
          ← 주간 일정
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">슬롯 등록</h1>
        <p className="text-muted-foreground mt-1 text-sm">단일 등록 또는 반복(주·요일) 벌크 등록</p>
      </div>

      <AdminNewSlotClient mentors={mentors} defaultWeekMonday={defaultWeekMonday} />
    </div>
  );
}
