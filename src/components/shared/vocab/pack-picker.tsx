'use client';

import { cn } from '@/lib/utils';
import type { StudentPackView } from '@/lib/actions/vocab';

export function PackPicker({
  packs,
  selectedId,
  onSelect,
}: {
  packs: StudentPackView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (packs.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        이용 가능한 단어 꾸러미가 없습니다.
      </p>
    );
  }
  return (
    <div className='grid grid-cols-2 gap-3'>
      {packs.map((p) => {
        const selected = p.id === selectedId;
        return (
          <button
            key={p.id}
            type='button'
            disabled={!p.selectable}
            onClick={() => p.selectable && onSelect(p.id)}
            className={cn(
              'relative rounded-2xl border p-4 text-left transition-all',
              p.selectable
                ? selected
                  ? 'border-primary bg-primary/10 ring-primary ring-2'
                  : 'border-border bg-card active:scale-[0.98]'
                : 'border-border bg-muted/40 cursor-not-allowed opacity-60',
            )}
          >
            <p className='text-foreground font-semibold'>{p.name}</p>
            {p.description && (
              <p className='text-muted-foreground mt-0.5 line-clamp-2 text-xs'>{p.description}</p>
            )}
            {p.badge && (
              <span className='bg-muted text-muted-foreground mt-2 inline-block rounded-full px-2 py-0.5 text-xs'>
                {p.badge}
              </span>
            )}
            {selected && (
              <span className='bg-primary absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white'>
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
