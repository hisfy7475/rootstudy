import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMentoringSlotDetail } from '@/lib/actions/mentoring';
import { MentoringApplyClient } from './apply-client';

export default async function StudentMentoringApplyPage({
  params,
}: {
  params: Promise<{ slotId: string }>;
}) {
  const { slotId } = await params;
  const slot = await getMentoringSlotDetail(slotId);
  if (!slot) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <MentoringApplyClient
      slot={slot}
      studentId={user.id}
      backHref="/student/mentoring"
    />
  );
}
