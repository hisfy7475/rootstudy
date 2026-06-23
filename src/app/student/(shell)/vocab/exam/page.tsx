import Link from 'next/link';
import { getStudentVocabPacks } from '@/lib/actions/vocab';
import { getStudyDate } from '@/lib/utils';
import ExamIntroClient from './exam-intro-client';

export default async function VocabExamIntroPage() {
  const packs = await getStudentVocabPacks();
  const isFriday = getStudyDate(new Date()).getUTCDay() === 5;

  return (
    <div className='space-y-4 px-4 pt-4 pb-6'>
      <Link href='/student/vocab' className='text-primary text-sm'>
        ← 영단어 시험
      </Link>
      <h1 className='text-foreground text-lg font-bold'>시험보기</h1>
      <ExamIntroClient packs={packs} isFriday={isFriday} />
    </div>
  );
}
