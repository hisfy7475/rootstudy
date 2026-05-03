'use client';

import * as React from 'react';
import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildListHref } from '@/lib/list-params';

// 액션 기반 검색 입력. Enter 또는 좌측 돋보기 버튼 클릭 시 onSubmit, X는 즉시 onClear.
// URL 모드(기본): 내부에서 `q` searchParam 동기화.
// Controlled 모드: 호출부가 value/onSubmit/onClear 직접 관리 (URL 미사용 페이지용).

type UrlModeProps = {
  mode?: 'url';
  /** 동기화할 URL 키. 기본 'q'. */
  paramKey?: string;
  /** submit/clear 시 함께 비울 키. 기본 ['page']. */
  resetKeysOnSubmit?: readonly string[];
  placeholder?: string;
  className?: string;
};

type ControlledModeProps = {
  mode: 'controlled';
  value: string;
  onSubmit: (q: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
};

export type SearchInputProps = UrlModeProps | ControlledModeProps;

const DEFAULT_RESET = ['page'] as const;

export function SearchInput(props: SearchInputProps) {
  if (props.mode === 'controlled') {
    return <ControlledSearchInput {...props} />;
  }
  return <UrlSearchInput {...props} />;
}

function UrlSearchInput({
  paramKey = 'q',
  resetKeysOnSubmit = DEFAULT_RESET,
  placeholder = '검색...',
  className,
}: UrlModeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const applied = sp.get(paramKey) ?? '';
  const [draft, setDraft] = React.useState(applied);
  // URL의 q가 외부 변화(페이지 이동, 뒤로가기)로 바뀌면 입력 동기화
  React.useEffect(() => {
    setDraft(applied);
  }, [applied]);

  const patchUrl = React.useCallback(
    (patch: Record<string, string | null>) => {
      const cleaned: Record<string, string | null> = { ...patch };
      for (const key of resetKeysOnSubmit) {
        if (!(key in cleaned)) cleaned[key] = null;
      }
      const href = buildListHref(pathname, new URLSearchParams(sp.toString()), cleaned);
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [pathname, sp, router, resetKeysOnSubmit],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    patchUrl({ [paramKey]: trimmed ? trimmed : null });
  }

  function handleClear() {
    setDraft('');
    patchUrl({ [paramKey]: null });
  }

  return (
    <SearchInputView
      draft={draft}
      onDraftChange={setDraft}
      onSubmit={handleSubmit}
      onClear={handleClear}
      placeholder={placeholder}
      className={className}
    />
  );
}

function ControlledSearchInput({
  value,
  onSubmit,
  onClear,
  placeholder = '검색...',
  className,
}: ControlledModeProps) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(draft.trim());
  }

  function handleClear() {
    setDraft('');
    onClear();
  }

  return (
    <SearchInputView
      draft={draft}
      onDraftChange={setDraft}
      onSubmit={handleSubmit}
      onClear={handleClear}
      placeholder={placeholder}
      className={className}
    />
  );
}

interface SearchInputViewProps {
  draft: string;
  onDraftChange: (next: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  placeholder: string;
  className?: string;
}

function SearchInputView({
  draft,
  onDraftChange,
  onSubmit,
  onClear,
  placeholder,
  className,
}: SearchInputViewProps) {
  return (
    <form
      role='search'
      onSubmit={onSubmit}
      className={cn(
        'focus-within:ring-primary flex max-w-md min-w-[200px] flex-1 items-center gap-1 rounded-xl border border-gray-200 bg-white pr-2 pl-2 transition-all focus-within:border-transparent focus-within:ring-2',
        className,
      )}
    >
      <button
        type='submit'
        aria-label='검색'
        className='text-text-muted hover:text-text inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-gray-100'
      >
        <Search className='h-4 w-4' aria-hidden />
      </button>
      <input
        type='search'
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder={placeholder}
        className='text-text placeholder:text-text-muted w-full appearance-none border-0 bg-transparent py-2.5 text-sm outline-none focus:ring-0 focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none'
        style={{ outline: 'none', boxShadow: 'none' }}
      />
      {draft && (
        <button
          type='button'
          onClick={onClear}
          aria-label='검색어 지우기'
          className='text-text-muted inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-gray-100'
        >
          <X className='h-4 w-4' aria-hidden />
        </button>
      )}
    </form>
  );
}
