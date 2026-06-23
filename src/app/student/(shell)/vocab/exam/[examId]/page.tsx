import { redirect, notFound } from 'next/navigation';
import { getVocabExamForResume } from '@/lib/actions/vocab';
import RunnerClient from './runner-client';

export default async function VocabExamRunnerPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const view = await getVocabExamForResume(examId);
  if (!view) notFound();
  if (view.status === 'finished') redirect(`/student/vocab/exam/${examId}/result`);

  return (
    <RunnerClient
      examId={examId}
      packName={view.packName}
      remainingSec={view.remainingSec}
      questions={view.questions}
    />
  );
}
