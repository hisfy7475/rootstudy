import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { getVocabExamResult } from '@/lib/actions/vocab';
import { ExamResultView } from '@/components/shared/vocab/exam-result-view';

export default async function AdminVocabExamDetailPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const ctx = await requireAdminBranch();
  if (!ctx) notFound();
  const { examId } = await params;
  const result = await getVocabExamResult(examId);
  if (!result) notFound();

  return (
    <div className='mx-auto max-w-2xl space-y-4 p-4 sm:p-6'>
      <Link href='/admin/vocab/exams' className='text-primary text-sm hover:underline'>
        ← 응시내역으로
      </Link>
      <h1 className='text-text text-xl font-bold'>답안 상세</h1>
      <ExamResultView result={result} />
    </div>
  );
}
