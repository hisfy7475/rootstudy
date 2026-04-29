'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildListHref } from '@/lib/list-params';

export interface ToolbarFilterOption {
  value: string;
  label: string;
}

export interface ToolbarFilter {
  /** URL 쿼리 키 */
  key: string;
  /** UI 라벨 */
  label: string;
  options: ToolbarFilterOption[];
  /** "전체" 옵션 라벨. 미지정 시 '전체'. */
  allLabel?: string;
}

interface DataTableToolbarProps {
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  pageSizeChoices?: readonly number[];
  /**
   * 검색·필터·사이즈 변경 시 함께 비울 키 목록.
   * 기본 ['page'] — 필터 바뀌면 첫 페이지로.
   */
  resetKeysOnChange?: readonly string[];
  /** 페이지당 셀렉터 숨김. 기본 false. */
  hidePageSize?: boolean;
  /** 검색 인풋 숨김. 기본 false. */
  hideSearch?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const DEFAULT_RESET = ['page'] as const;

export function DataTableToolbar({
  searchPlaceholder = '검색...',
  filters = [],
  pageSizeChoices = [20, 50, 100],
  resetKeysOnChange = DEFAULT_RESET,
  hidePageSize = false,
  hideSearch = false,
  className,
  children,
}: DataTableToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const initialQ = sp.get('q') ?? '';
  const [q, setQ] = React.useState(initialQ);
  React.useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchUrl = React.useCallback(
    (patch: Record<string, string | number | null>) => {
      const cleaned: Record<string, string | number | null> = { ...patch };
      for (const key of resetKeysOnChange) {
        if (!(key in cleaned)) cleaned[key] = null;
      }
      const href = buildListHref(pathname, new URLSearchParams(sp.toString()), cleaned);
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [pathname, sp, router, resetKeysOnChange],
  );

  function onSearchChange(next: string) {
    setQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      patchUrl({ q: next.trim() ? next.trim() : null });
    }, 300);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ('');
    patchUrl({ q: null });
  }

  return (
    <div
      className={cn(
        'bg-card flex flex-wrap items-center gap-3 rounded-2xl p-3 shadow-sm',
        className,
      )}
    >
      {!hideSearch && (
        <div className='relative max-w-md min-w-[200px] flex-1'>
          <Search
            className='text-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2'
            aria-hidden
          />
          <input
            type='search'
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className='text-text placeholder:text-text-muted focus:ring-primary flex w-full rounded-xl border border-gray-200 bg-white py-2.5 pr-9 pl-10 text-sm transition-all focus:border-transparent focus:ring-2 focus:outline-none'
          />
          {q && (
            <button
              type='button'
              onClick={clearSearch}
              aria-label='검색어 지우기'
              className='text-text-muted absolute top-1/2 right-2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md hover:bg-gray-100'
            >
              <X className='h-4 w-4' />
            </button>
          )}
        </div>
      )}

      {filters.map((f) => {
        const value = sp.get(f.key) ?? '';
        return (
          <label key={f.key} className='flex items-center gap-2 text-sm'>
            <span className='text-text-muted'>{f.label}</span>
            <select
              value={value}
              onChange={(e) => patchUrl({ [f.key]: e.target.value || null })}
              className='text-text focus:ring-primary rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:outline-none'
            >
              <option value=''>{f.allLabel ?? '전체'}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}

      {children}

      {!hidePageSize && (
        <label className='ml-auto flex items-center gap-2 text-sm'>
          <span className='text-text-muted'>페이지당</span>
          <select
            value={sp.get('size') ?? `${pageSizeChoices[0]}`}
            onChange={(e) => patchUrl({ size: e.target.value })}
            className='text-text focus:ring-primary rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:outline-none'
          >
            {pageSizeChoices.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
