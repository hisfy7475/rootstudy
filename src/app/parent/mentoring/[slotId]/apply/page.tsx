import { notFound, redirect } from 'next/navigation';
import { getLinkedStudents } from '@/lib/actions/parent';
import { getMentoringSlotDetail } from '@/lib/actions/mentoring';
import { MentoringApplyClient } from '@/app/student/(shell)/mentoring/[slotId]/apply/apply-client';

export default async function ParentMentoringApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slotId: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const { slotId } = await params;
  const sp = await searchParams;
  const forStudentId = sp.for;

  const students = await getLinkedStudents();
  // 퇴원 자녀로의 신규 신청은 차단(URL 직접 접근 포함). 서버 액션에도 최후 방어선이 있음.
  const allowed = forStudentId && students.some((s) => s.id === forStudentId && !s.withdrawnAt);
  if (!allowed) {
    redirect('/parent/mentoring');
  }

  const slot = await getMentoringSlotDetail(slotId);
  if (!slot) notFound();

  return (
    <MentoringApplyClient slot={slot} studentId={forStudentId!} backHref='/parent/mentoring' />
  );
}
