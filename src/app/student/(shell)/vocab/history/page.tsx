import Link from 'next/link';
import { getMyVocabHistory } from '@/lib/actions/vocab';
import { Badge } from '@/components/ui/badge';

const TYPE_LABEL = { normal: '일반', friday_review: '금요일 오답' } as const;
const SUBMIT_LABEL = { in_progress: '진행 중', normal: '정상 제출', auto: '자동 제출' } as const;

export default async function VocabHistoryPage() {
  const items = await getMyVocabHistory();

  return (
    <div className='space-y-4 px-4 pt-4 pb-6'>
      <Link href='/student/vocab' className='text-primary text-sm'>
        ← 영단어 시험
      </Link>
      <h1 className='text-foreground text-lg font-bold'>응시내역</h1>

      {items.length === 0 ? (
        <p className='text-muted-foreground py-10 text-center text-sm'>
          아직 응시한 시험이 없습니다.
        </p>
      ) : (
        <ul className='space-y-2'>
          {items.map((it) => (
            <li key={it.examId}>
              <Link
                href={`/student/vocab/exam/${it.examId}/result`}
                className='border-border bg-card flex items-center justify-between gap-3 rounded-2xl border px-4 py-3'
              >
                <div>
                  <div className='flex items-center gap-2'>
                    <span className='text-foreground font-semibold'>{it.packName}</span>
                    <Badge variant={it.examType === 'friday_review' ? 'warning' : 'muted'}>
                      {TYPE_LABEL[it.examType]}
                    </Badge>
                  </div>
                  <p className='text-muted-foreground text-xs'>
                    {it.examDate} · {SUBMIT_LABEL[it.submitType]}
                  </p>
                </div>
                <span className='text-foreground text-lg font-bold'>
                  {it.score === null ? '-' : `${it.score}`}
                  <span className='text-muted-foreground text-sm'>/{it.total}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
