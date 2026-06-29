'use client';

import { useState, useTransition } from 'react';
import { PackPicker } from '@/components/shared/vocab/pack-picker';
import { getPreviewWords, type StudentPackView, type PreviewWord } from '@/lib/actions/vocab';
import { formatProblemGroups } from '@/lib/vocab-problem-group';

export default function PreviewClient({ packs }: { packs: StudentPackView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [words, setWords] = useState<PreviewWord[] | null>(null);
  const [pending, startTransition] = useTransition();

  function select(id: string) {
    setSelectedId(id);
    setWords(null);
    startTransition(async () => setWords(await getPreviewWords(id)));
  }

  return (
    <div className='space-y-4'>
      <PackPicker packs={packs} selectedId={selectedId} onSelect={select} />

      {selectedId && (
        <div>
          {pending && (
            <p className='text-muted-foreground py-6 text-center text-sm'>불러오는 중…</p>
          )}
          {words && words.length === 0 && (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              등록된 단어가 없습니다.
            </p>
          )}
          {words && words.length > 0 && (
            <ul className='border-border bg-card divide-border divide-y overflow-hidden rounded-2xl border'>
              {words.map((w, i) => (
                <li key={i} className='flex items-center justify-between gap-3 px-4 py-3'>
                  <div>
                    <p className='text-foreground font-semibold'>{w.english}</p>
                    {formatProblemGroups(w.problemGroup) && (
                      <p className='text-muted-foreground text-xs'>
                        {formatProblemGroups(w.problemGroup)}
                      </p>
                    )}
                  </div>
                  <div className='text-right'>
                    <p className='text-foreground text-sm'>{w.koreanPrimary}</p>
                    {w.koreanExtra && (
                      <p className='text-muted-foreground text-xs'>{w.koreanExtra}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
