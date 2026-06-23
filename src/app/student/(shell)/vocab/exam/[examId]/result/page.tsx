import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getVocabExamResult } from '@/lib/actions/vocab';
import { ExamResultView } from '@/components/shared/vocab/exam-result-view';

export default async function VocabExamResultPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const result = await getVocabExamResult(examId);
  if (!result) notFound();

  return (
    <div className='space-y-4 px-4 pt-4 pb-6'>
      <h1 className='text-foreground text-lg font-bold'>시험 결과</h1>
      <ExamResultView result={result} />
      <div className='flex gap-2'>
        <Link
          href='/student/vocab/history'
          className='border-border text-foreground flex-1 rounded-2xl border py-3 text-center text-sm font-medium'
        >
          응시내역
        </Link>
        <Link
          href='/student/vocab'
          className='bg-primary flex-1 rounded-2xl py-3 text-center text-sm font-medium text-white'
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
