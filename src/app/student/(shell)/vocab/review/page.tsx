import Link from 'next/link';
import { getWeeklyWrongWords } from '@/lib/actions/vocab';

export default async function VocabReviewPage() {
  const words = await getWeeklyWrongWords();

  return (
    <div className='space-y-4 px-4 pt-4 pb-6'>
      <Link href='/student/vocab' className='text-primary text-sm'>
        ← 영단어 시험
      </Link>
      <div>
        <h1 className='text-foreground text-lg font-bold'>복습하기</h1>
        <p className='text-muted-foreground text-sm'>
          이번 주(월~목) 틀린 단어를 모았어요. 금요일 누적 오답 시험 전에 복습해 보세요.
        </p>
      </div>

      {words.length === 0 ? (
        <p className='text-muted-foreground py-10 text-center text-sm'>이번 주 오답이 없습니다.</p>
      ) : (
        <>
          <p className='text-muted-foreground text-sm'>이번 주 오답 {words.length}개</p>
          <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
            {words.map((w, i) => (
              <li key={i} className='flex items-center justify-between gap-3 px-4 py-3'>
                <p className='text-foreground font-semibold'>{w.english}</p>
                <p className='text-foreground text-right text-sm'>{w.answer}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
