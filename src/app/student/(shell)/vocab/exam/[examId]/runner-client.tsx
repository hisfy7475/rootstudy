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

  const [remaining, setRemaining] = useState(remainingSec);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // 타이머 만료/제출 콜백에서 최신 답안을 참조하기 위한 ref(이펙트 deps 누락 방지).
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const total = questions.length;

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

  // 제출(수동). 미응답이 있으면 경고 후, 채점 직전 보유 답안 전체를 서버에 동기화.
  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    const unanswered = total - Object.keys(answersRef.current).length;
    if (
      unanswered > 0 &&
      !confirm(
        `아직 답하지 않은 문제가 ${unanswered}개 있습니다. 제출할까요? 미응답 문제는 오답 처리됩니다.`,
      )
    ) {
      return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    await submitVocabExam(examId, answersRef.current);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    goResult();
  }, [examId, storageKey, goResult, total]);

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

  // 이탈 경고: 웹은 새로고침·탭닫기(beforeunload), 뒤로가기는 popstate 가드로 확인.
  // 앱(WebView)에서 beforeunload 는 무시되지만 무해하고, 뒤로가기(안드 BackHandler→goBack)는
  // popstate 로 동일하게 처리된다. 제출/자동마감(submittedRef) 이후엔 가드를 풀어
  // 결과 화면 이동을 막지 않는다. 데이터는 어차피 재접속 복원되므로 경고는 실수 방지용.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    // 더미 history 엔트리를 쌓아 뒤로가기를 가로챈다.
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      if (submittedRef.current) return;
      if (confirm('시험을 나가시겠어요? 진행 상황은 저장되며 제한시간은 계속 진행됩니다.')) {
        router.push('/student/vocab');
      } else {
        // 취소 시 현재 화면 유지를 위해 더미 엔트리를 다시 쌓는다.
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [router]);

  function pick(qno: number, selected: string) {
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

  if (questions.length === 0) return null;

  // 헤더/하단탭이 있는 (shell) 안에서도 시험은 풀스크린이어야 하므로 fixed 오버레이로
  // 전체 뷰포트를 덮는다(z-[60] > BottomNav z-50). 상단/하단은 고정, 문제 영역만 스크롤.
  // 노치·홈인디케이터는 pt-safe/pb-safe(= var(--app-safe-*))로 흡수해 앱 환경까지 대응.
  return (
    <div className='bg-background fixed inset-0 z-[60] flex justify-center'>
      <div className='flex h-full w-full max-w-lg flex-col'>
        {/* 상단 (safe-top) */}
        <div className='pt-safe shrink-0 px-4'>
          <div className='flex items-center justify-between pt-3'>
            <button
              onClick={() => {
                if (
                  confirm('시험을 종료할까요? 진행 상황은 저장되며 제한시간은 계속 진행됩니다.')
                ) {
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

          {/* 진행(응답 개수 기준) */}
          <div className='mt-3 pb-3'>
            <div className='text-muted-foreground flex justify-between text-xs'>
              <span>전체 {total}문제</span>
              <span>
                응답 {answeredCount} / {total}
              </span>
            </div>
            <div className='bg-muted mt-1 h-1.5 overflow-hidden rounded-full'>
              <div
                className='bg-primary h-full transition-all'
                style={{ width: `${total > 0 ? (answeredCount / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* 문제 — 전 문항을 한 화면에 세로로 나열, 이 영역만 스크롤(롤다운) */}
        <div className='flex-1 space-y-8 overflow-y-auto px-4 py-6'>
          {questions.map((q) => (
            <div key={q.questionNo}>
              <div className='flex items-baseline gap-2'>
                <span className='text-muted-foreground text-sm font-medium'>{q.questionNo}.</span>
                <p className='text-foreground text-2xl font-bold'>{q.english}</p>
              </div>
              <div className='mt-4 space-y-3'>
                {q.options.map((opt) => {
                  const selected = answers[q.questionNo] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => pick(q.questionNo, opt)}
                      aria-pressed={selected}
                      className={cn(
                        // 긴 뜻 대응: 글씨 축소 + 한글 단어 단위 줄바꿈(자르지 않음 — 정답 식별 보존).
                        'w-full rounded-2xl border px-4 py-3.5 text-left text-sm leading-snug break-keep transition-all',
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
          ))}
        </div>

        {/* 하단 (safe-bottom, 제출 버튼 항상 고정 노출) */}
        <div className='border-border bg-background pb-safe shrink-0 border-t px-4'>
          <div className='pt-3 pb-3'>
            <Button className='w-full' disabled={submitting} onClick={submit}>
              {submitting ? '제출 중…' : `제출 (${answeredCount}/${total})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
