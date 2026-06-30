'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatMeaning } from '@/lib/vocab-format';
import type { ExamResult } from '@/lib/actions/vocab';

const TYPE_LABEL = { normal: '일반', friday_review: '금요일 오답' } as const;
const SUBMIT_LABEL = { in_progress: '진행 중', normal: '정상 제출', auto: '자동 제출' } as const;

export function ExamResultView({ result }: { result: ExamResult }) {
  const [wrongOnly, setWrongOnly] = useState(false);
  const wrongCount = result.questions.filter((q) => !q.isCorrect).length;
  const shown = wrongOnly ? result.questions.filter((q) => !q.isCorrect) : result.questions;

  return (
    <div className='space-y-4'>
      {/* 요약 */}
      <div className='rounded-2xl border border-gray-200 bg-white p-5'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='info'>{result.packName}</Badge>
          <Badge variant={result.examType === 'friday_review' ? 'warning' : 'muted'}>
            {TYPE_LABEL[result.examType]}
          </Badge>
          <Badge variant={result.submitType === 'auto' ? 'warning' : 'success'}>
            {SUBMIT_LABEL[result.submitType]}
          </Badge>
          <span className='text-text-muted text-sm'>{result.examDate}</span>
        </div>
        <div className='mt-3 flex items-end gap-3'>
          <span className='text-text text-3xl font-bold'>
            {result.score} <span className='text-text-muted text-xl'>/ {result.total}</span>
          </span>
          <span className='text-text-muted mb-1 text-sm'>
            정답 {result.score} · 오답 {result.total - result.score}
          </span>
        </div>
      </div>

      {/* 오답만 보기 */}
      <div className='flex items-center justify-between'>
        <span className='text-text-muted text-sm'>문항 {shown.length}개</span>
        <button
          type='button'
          onClick={() => setWrongOnly((v) => !v)}
          className={cn(
            'rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors',
            wrongOnly
              ? 'border-primary bg-primary/10 text-primary'
              : 'text-text-muted border-gray-200 hover:bg-gray-50',
          )}
        >
          오답만 보기 {wrongOnly ? `(${wrongCount})` : ''}
        </button>
      </div>

      {/* 문항 리스트 */}
      <ul className='space-y-2'>
        {shown.map((q) => (
          <li
            key={q.questionNo}
            className={cn(
              'rounded-2xl border p-4',
              q.isCorrect ? 'border-gray-200 bg-white' : 'border-error/40 bg-error/5',
            )}
          >
            <div className='flex items-center justify-between'>
              <span className='text-text-muted text-xs'>{q.questionNo}번</span>
              <Badge variant={q.isCorrect ? 'success' : 'danger'}>
                {q.isCorrect ? '정답' : '오답'}
              </Badge>
            </div>
            <p className='text-text mt-1 text-lg font-semibold'>{q.english}</p>
            <div className='mt-2 space-y-1 text-sm break-keep'>
              <p>
                <span className='text-text-muted'>정답: </span>
                <span className='text-text font-medium'>{formatMeaning(q.answer)}</span>
              </p>
              <p>
                <span className='text-text-muted'>내 답: </span>
                <span className={cn('font-medium', q.isCorrect ? 'text-text' : 'text-error')}>
                  {q.selected ? formatMeaning(q.selected) : '미선택'}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
