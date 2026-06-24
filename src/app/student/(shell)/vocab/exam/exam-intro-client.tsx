'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PackPicker } from '@/components/shared/vocab/pack-picker';
import { startVocabExam, type StudentPackView } from '@/lib/actions/vocab';

const NOTICES = [
  '시험은 계정 기준 하루에 한 번만 응시할 수 있습니다.',
  '한 번의 시험에는 최대 40문제가 출제됩니다.',
  '시험 제한시간은 10분입니다.',
  '제한시간이 종료되면 현재까지 작성한 내용으로 자동 제출됩니다.',
  '제출한 시험은 다시 응시할 수 없습니다.',
  '정답을 선택하지 않은 문제는 오답 처리됩니다.',
  '매주 금요일에는 이번 주(월~목) 누적 오답 전체가 출제됩니다. (문항 수는 오답 수에 따라 달라집니다)',
  '시험 중 앱을 종료하더라도 제한시간은 계속 진행됩니다.',
];

export default function ExamIntroClient({
  packs,
  isFriday,
}: {
  packs: StudentPackView[];
  isFriday: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function start() {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const res = await startVocabExam(selectedId);
      if (!res.ok) return setError(res.error);
      router.push(`/student/vocab/exam/${res.examId}`);
    });
  }

  return (
    <div className='space-y-5'>
      <div className='border-border bg-card space-y-2 rounded-2xl border p-4'>
        <p className='text-foreground font-medium'>
          영단어 시험은 10분간 진행됩니다. 시험에 응시할 단어 꾸러미를 선택해 주세요.
        </p>
        {isFriday && (
          <span className='inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'>
            이번 주 오답 복습 시험 (월~목 틀린 단어 포함)
          </span>
        )}
        <ul className='text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-xs'>
          {NOTICES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      <PackPicker packs={packs} selectedId={selectedId} onSelect={setSelectedId} />

      {error && <p className='bg-error/10 text-error rounded-xl px-3 py-2 text-sm'>{error}</p>}

      <Button className='w-full' disabled={!selectedId || pending} onClick={start}>
        {pending ? '시작 중…' : '시험 시작'}
      </Button>
    </div>
  );
}
