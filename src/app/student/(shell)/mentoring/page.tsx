import Link from 'next/link';
import { getTodayKST } from '@/lib/utils';
import { getMentoringSlotsForRange } from '@/lib/actions/mentoring';
import { monthRangeYmd } from '@/lib/mentoring-calendar';
import { MentoringCalendarClient } from './mentoring-client';

export default async function StudentMentoringPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const today = getTodayKST();
  const [ty, tm] = today.split('-').map(Number);
  const y = sp.y ? Math.min(2100, Math.max(2020, parseInt(sp.y, 10) || ty)) : ty;
  const m = sp.m ? Math.min(12, Math.max(1, parseInt(sp.m, 10) || tm)) : tm;

  const { fromYmd, toYmd } = monthRangeYmd(y, m);
  const slots = await getMentoringSlotsForRange(fromYmd, toYmd);

  return (
    <div className='px-4 pt-4 pb-2'>
      <div className='mb-1 flex items-center justify-between gap-2'>
        <h1 className='text-foreground text-xl font-bold'>멘토링/클리닉/상담</h1>
        <Link
          href='/student/mentoring/my'
          className='text-primary text-sm font-medium whitespace-nowrap'
        >
          내 신청
        </Link>
      </div>
      <p className='text-muted-foreground mb-4 text-sm'>
        날짜를 선택한 뒤 신청 가능한 슬롯을 확인하세요.
      </p>
      <MentoringCalendarClient
        initialSlots={slots}
        year={y}
        month={m}
        basePath='/student/mentoring'
      />
    </div>
  );
}
