import Link from 'next/link';
import { getStudentVocabPacks } from '@/lib/actions/vocab';
import PreviewClient from './preview-client';

export default async function VocabPreviewPage() {
  const packs = await getStudentVocabPacks();
  return (
    <div className='space-y-4 px-4 pt-4 pb-6'>
      <Link href='/student/vocab' className='text-primary text-sm'>
        ← 영단어 시험
      </Link>
      <h1 className='text-foreground text-lg font-bold'>예습하기</h1>
      <PreviewClient packs={packs} />
    </div>
  );
}
