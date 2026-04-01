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
  const allowed = forStudentId && students.some((s) => s.id === forStudentId);
  if (!allowed) {
    redirect('/parent/mentoring');
  }

  const slot = await getMentoringSlotDetail(slotId);
  if (!slot) notFound();

  return (
    <MentoringApplyClient
      slot={slot}
      studentId={forStudentId!}
      backHref="/parent/mentoring"
    />
  );
}
