'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Search, X } from 'lucide-react';
import { searchStudentsForAdmin } from '@/lib/actions/mentoring';
import { cn } from '@/lib/utils';

export type StudentOption = {
  id: string;
  name: string;
  phone: string | null;
  branch_id: string | null;
  branch_name: string | null;
};

interface Props {
  /** 슈퍼관리자가 슬롯 branch 로 검색을 강제할 때 사용. 일반 어드민은 서버에서 자기 지점으로 자동 필터 */
  branchId?: string | null;
  value: StudentOption | null;
  onChange: (next: StudentOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function StudentCombobox({
  branchId,
  value,
  onChange,
  disabled = false,
  placeholder = '학생 이름으로 검색 (2글자 이상)',
}: Props) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<StudentOption[]>([]);
  const [pending, startTransition] = useTransition();
  const cacheRef = useRef<Map<string, { at: number; results: StudentOption[] }>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // 300ms debounce + 5초 캐시. 2글자 미만일 때는 검색을 호출하지 않음 (results 는 render-time 에 가림).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const cached = cacheRef.current.get(`${branchId ?? ''}::${q}`);
    if (cached && Date.now() - cached.at < 5000) {
      setResults(cached.results);
      return;
    }
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const data = await searchStudentsForAdmin(q, { branchId: branchId ?? null, limit: 10 });
        cacheRef.current.set(`${branchId ?? ''}::${q}`, { at: Date.now(), results: data });
        setResults(data);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, branchId]);

  const visibleResults = query.trim().length >= 2 ? results : [];

  if (value) {
    return (
      <div className='bg-muted/40 flex items-center justify-between gap-2 rounded-xl border px-3 py-2'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium'>{value.name}</p>
          <p className='text-muted-foreground truncate text-xs'>
            {value.branch_name ?? '지점 없음'}
            {value.phone ? ` · ${value.phone}` : ''}
          </p>
        </div>
        <button
          type='button'
          onClick={() => onChange(null)}
          disabled={disabled}
          className='text-muted-foreground hover:text-foreground rounded-md p-1 disabled:opacity-50'
          aria-label='선택 해제'
        >
          <X className='size-4' />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className='relative'>
      <div className='focus-within:ring-ring flex items-center gap-2 rounded-xl border px-3 py-2 focus-within:ring-2'>
        <Search className='text-muted-foreground size-4 flex-shrink-0' />
        <input
          type='text'
          className='flex-1 bg-transparent text-sm outline-none'
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
          aria-controls={listId}
          role='combobox'
          aria-expanded={open}
        />
        {pending && <span className='text-muted-foreground text-xs'>검색 중…</span>}
      </div>
      {open && query.trim().length >= 2 && (
        <ul
          id={listId}
          className='absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg'
        >
          {visibleResults.length === 0 && !pending ? (
            <li className='text-muted-foreground px-3 py-2 text-sm'>검색 결과가 없습니다.</li>
          ) : (
            visibleResults.map((s) => (
              <li key={s.id}>
                <button
                  type='button'
                  onClick={() => {
                    onChange(s);
                    setQuery('');
                    setOpen(false);
                  }}
                  className={cn(
                    'block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100',
                  )}
                >
                  <p className='font-medium'>{s.name}</p>
                  <p className='text-muted-foreground text-xs'>
                    {s.branch_name ?? '지점 없음'}
                    {s.phone ? ` · ${s.phone}` : ''}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
