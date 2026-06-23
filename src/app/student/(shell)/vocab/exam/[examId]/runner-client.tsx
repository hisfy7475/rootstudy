'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  saveVocabAnswer,
  submitVocabExam,
  syncVocabAnswers,
  type ExamQuestionView,
} from '@/lib/actions/vocab';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RunnerClient({
  examId,
  packName,
  remainingSec,
  questions,
}: {
  examId: string;
  packName: string;
  remainingSec: number;
  questions: ExamQuestionView[];
}) {
  const router = useRouter();
  const storageKey = `vocab-exam-${examId}`;

  // 답안: questionNo → selected. 서버 값 우선, 로컬 백업 보강.
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    const base: Record<number, string> = {};
    for (const q of questions) if (q.selected) base[q.questionNo] = q.selected;
    if (typeof window !== 'undefined') {
      try {
        const local = JSON.parse(localStorage.getItem(storageKey) || '{}') as Record<
          number,
          string
        >;
        for (const [no, sel] of Object.entries(local))
          if (!base[Number(no)]) base[Number(no)] = sel;
      } catch {}
    }
    return base;
  });

  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(remainingSec);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // 타이머 만료/제출 콜백에서 최신 답안을 참조하기 위한 ref(이펙트 deps 누락 방지).
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const total = questions.length;
  const current = questions[idx];

  // 복원 직후: localStorage 에만 있고 서버에 미반영인 답안을 best-effort 재동기화.
  // (시험 중 네트워크 끊김 동안 저장 실패한 답이 점수에 누락되지 않도록)
  useEffect(() => {
    const serverSelected: Record<number, string> = {};
    for (const q of questions) if (q.selected) serverSelected[q.questionNo] = q.selected;
    const toSync: Record<number, string> = {};
    for (const [no, sel] of Object.entries(answersRef.current)) {
      if (serverSelected[Number(no)] !== sel) toSync[Number(no)] = sel;
    }
    if (Object.keys(toSync).length > 0) void syncVocabAnswers(examId, toSync);
    // 최초 마운트 1회만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goResult = useCallback(() => {
    router.replace(`/student/vocab/exam/${examId}/result`);
  }, [router, examId]);

  // 제출(수동). 채점 직전 보유 답안 전체를 서버에 동기화(끊김 복구분 포함).
  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    await submitVocabExam(examId, answersRef.current);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    goResult();
  }, [examId, storageKey, goResult]);

  // 타이머(서버 권위 — remainingSec 기준). 0이면 결과로(서버가 auto 마감).
  useEffect(() => {
    if (remaining <= 0) {
      if (!submittedRef.current) {
        submittedRef.current = true;
        // auto 마감(result 페이지의 lazy finalize) 전에 보유 답안을 flush 해
        // 끊김 복구분이 자동 채점에서 누락되지 않게 한다.
        void syncVocabAnswers(examId, answersRef.current).finally(() => {
          try {
            localStorage.removeItem(storageKey);
          } catch {}
          goResult();
        });
      }
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, storageKey, goResult, examId]);

  function pick(selected: string) {
    if (!current) return;
    const qno = current.questionNo;
    setAnswers((prev) => {
      const next = { ...prev, [qno]: selected };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    // 서버 즉시 저장(낙관적, 실패해도 진행).
    void saveVocabAnswer(examId, qno, selected);
  }

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const lowTime = remaining <= 60;

  if (!current) return null;

  return (
    <div className='flex min-h-[100dvh] flex-col px-4 pt-4 pb-6'>
      {/* 상단 */}
      <div className='flex items-center justify-between'>
        <button
          onClick={() => {
            if (confirm('시험을 종료할까요? 진행 상황은 저장되며 제한시간은 계속 진행됩니다.')) {
              router.push('/student/vocab');
            }
          }}
          className='text-muted-foreground text-sm'
        >
          시험 종료
        </button>
        <span className='text-muted-foreground text-sm'>{packName}</span>
        <span
          aria-live='polite'
          className={cn(
            'rounded-full px-3 py-1 text-sm font-semibold tabular-nums',
            lowTime ? 'bg-error/10 text-error' : 'bg-muted text-foreground',
          )}
        >
          {fmt(remaining)}
        </span>
      </div>

      {/* 진행 */}
      <div className='mt-3'>
        <div className='text-muted-foreground flex justify-between text-xs'>
          <span>
            {idx + 1} / {total}
          </span>
          <span>응답 {answeredCount}</span>
        </div>
        <div className='bg-muted mt-1 h-1.5 overflow-hidden rounded-full'>
          <div
            className='bg-primary h-full transition-all'
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* 문제 */}
      <div className='mt-8 flex-1'>
        <p className='text-foreground text-center text-3xl font-bold'>{current.english}</p>
        <div className='mt-8 space-y-3'>
          {current.options.map((opt) => {
            const selected = answers[current.questionNo] === opt;
            return (
              <button
                key={opt}
                onClick={() => pick(opt)}
                aria-pressed={selected}
                className={cn(
                  'w-full rounded-2xl border px-4 py-4 text-left text-base transition-all',
                  selected
                    ? 'border-primary bg-primary/10 ring-primary ring-2'
                    : 'border-border bg-card active:scale-[0.99]',
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* 하단 */}
      <div className='mt-6 flex gap-2'>
        <Button
          variant='outline'
          className='flex-1'
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          이전
        </Button>
        {idx < total - 1 ? (
          <Button className='flex-1' onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}>
            다음
          </Button>
        ) : (
          <Button className='flex-1' disabled={submitting} onClick={submit}>
            {submitting ? '제출 중…' : '제출'}
          </Button>
        )}
      </div>
    </div>
  );
}
