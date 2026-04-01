import Link from 'next/link';
import { getAdminMentoringSlotsForRange } from '@/lib/actions/mentoring';
import { getMondayOfWeekKST } from '@/lib/mentoring-calendar';
import { getTodayKST, getWeekDateStringsFromMondayKST, formatDateKST } from '@/lib/utils';
import { AdminMentoringWeekClient } from './mentoring-client';
import { cn } from '@/lib/utils';
import { Plus, Users } from 'lucide-react';

function addDaysKstYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd.split('T')[0]}T12:00:00+09:00`);
  return formatDateKST(new Date(d.getTime() + deltaDays * 86400000));
}

type PageProps = {
  searchParams: Promise<{ w?: string }>;
};

export default async function AdminMentoringWeekPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const today = getTodayKST();
  const monday =
    sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? sp.w : getMondayOfWeekKST(today);
  const weekDates = getWeekDateStringsFromMondayKST(monday);
  const fromYmd = weekDates[0];
  const toYmd = weekDates[6];
  const slots = await getAdminMentoringSlotsForRange(fromYmd, toYmd);

  const prevWeek = addDaysKstYmd(monday, -7);
  const nextWeek = addDaysKstYmd(monday, 7);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">멘토링·클리닉 주간 일정</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {fromYmd} ~ {toYmd} (KST)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/mentoring?w=${prevWeek}`}
            className={cn(
              'rounded-2xl border px-4 py-2 text-sm font-medium transition-colors',
              'hover:bg-muted'
            )}
          >
            이전 주
          </Link>
          <Link
            href={`/admin/mentoring?w=${nextWeek}`}
            className={cn(
              'rounded-2xl border px-4 py-2 text-sm font-medium transition-colors',
              'hover:bg-muted'
            )}
          >
            다음 주
          </Link>
          <Link
            href="/admin/mentoring/applications"
            className={cn(
              'inline-flex items-center gap-1 rounded-2xl border px-4 py-2 text-sm font-medium',
              'hover:bg-muted'
            )}
          >
            전체 신청
          </Link>
          <Link
            href="/admin/mentoring/mentors"
            className={cn(
              'inline-flex items-center gap-1 rounded-2xl border px-4 py-2 text-sm font-medium',
              'hover:bg-muted'
            )}
          >
            <Users className="size-4" />
            멘토 관리
          </Link>
          <Link
            href="/admin/mentoring/slots/new"
            className={cn(
              'inline-flex items-center gap-1 rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
              'hover:bg-primary/90'
            )}
          >
            <Plus className="size-4" />
            슬롯 등록
          </Link>
        </div>
      </div>

      <AdminMentoringWeekClient weekDates={weekDates} initialSlots={slots} mondayYmd={monday} />
    </div>
  );
}
