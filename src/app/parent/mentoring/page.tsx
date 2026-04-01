import Link from 'next/link';
import { getLinkedStudents } from '@/lib/actions/parent';
import { getMentoringSlotsForRange } from '@/lib/actions/mentoring';
import { getTodayKST } from '@/lib/utils';
import { monthRangeYmd } from '@/lib/mentoring-calendar';
import { ParentMentoringClient } from './parent-mentoring-client';

export default async function ParentMentoringPage({
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
  const [slots, students] = await Promise.all([
    getMentoringSlotsForRange(fromYmd, toYmd),
    getLinkedStudents(),
  ]);

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h1 className="text-xl font-bold text-foreground">멘토링·클리닉</h1>
        <Link
          href="/parent/mentoring/my"
          className="text-sm font-medium text-primary whitespace-nowrap"
        >
          신청 내역
        </Link>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        자녀를 선택한 뒤 날짜·슬롯을 고르세요.
      </p>
      <ParentMentoringClient
        initialSlots={slots}
        year={y}
        month={m}
        students={students}
      />
    </div>
  );
}
