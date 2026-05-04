import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildListHref } from '@/lib/list-params';

interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  pathname: string;
  searchParams: URLSearchParams;
  className?: string;
  /** 현재 페이지 양옆에 표시할 페이지 수 (기본 1) */
  siblingCount?: number;
}

function getPages(
  currentPage: number,
  totalPages: number,
  sibling: number,
): (number | 'ellipsis')[] {
  if (totalPages <= 1) return [1];

  const middleStart = Math.max(2, currentPage - sibling);
  const middleEnd = Math.min(totalPages - 1, currentPage + sibling);

  const out: (number | 'ellipsis')[] = [1];
  if (middleStart > 2) out.push('ellipsis');
  for (let i = middleStart; i <= middleEnd; i++) out.push(i);
  if (middleEnd < totalPages - 1) out.push('ellipsis');
  if (totalPages > 1) out.push(totalPages);

  // 인접 ellipsis 제거
  return out.filter((v, i, arr) => !(v === 'ellipsis' && arr[i - 1] === 'ellipsis'));
}

export function Pagination({
  total,
  page,
  pageSize,
  pathname,
  searchParams,
  className,
  siblingCount = 1,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const items = getPages(page, totalPages, siblingCount);
  const prevHref = page > 1 ? buildListHref(pathname, searchParams, { page: page - 1 }) : null;
  const nextHref =
    page < totalPages ? buildListHref(pathname, searchParams, { page: page + 1 }) : null;

  return (
    <nav className={cn('flex items-center gap-1', className)} aria-label='페이지네이션'>
      {prevHref ? (
        <Link
          href={prevHref}
          aria-label='이전 페이지'
          scroll={false}
          className='text-text inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 transition-colors hover:bg-gray-100'
        >
          <ChevronLeft className='h-4 w-4' />
        </Link>
      ) : (
        <span
          aria-disabled
          className='text-text-muted/50 inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-100'
        >
          <ChevronLeft className='h-4 w-4' />
        </span>
      )}

      {items.map((item, i) => {
        if (item === 'ellipsis') {
          return (
            <span
              key={`e-${i}`}
              className='text-text-muted inline-flex h-9 min-w-9 items-center justify-center'
            >
              …
            </span>
          );
        }
        const isActive = item === page;
        const href = buildListHref(pathname, searchParams, { page: item });
        return (
          <Link
            key={item}
            href={href}
            scroll={false}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary bg-primary text-white'
                : 'text-text border-gray-200 hover:bg-gray-100',
            )}
          >
            {item}
          </Link>
        );
      })}

      {nextHref ? (
        <Link
          href={nextHref}
          aria-label='다음 페이지'
          scroll={false}
          className='text-text inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 transition-colors hover:bg-gray-100'
        >
          <ChevronRight className='h-4 w-4' />
        </Link>
      ) : (
        <span
          aria-disabled
          className='text-text-muted/50 inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-100'
        >
          <ChevronRight className='h-4 w-4' />
        </span>
      )}
    </nav>
  );
}
