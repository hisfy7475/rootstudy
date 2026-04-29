import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buildListHref } from '@/lib/list-params';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

interface TabsProps {
  items: TabItem[];
  activeValue: string;
  pathname: string;
  searchParams: URLSearchParams;
  /** 탭 URL 키. 기본 'tab'. */
  paramKey?: string;
  /** 탭 변경 시 함께 비울 키 목록. 기본 ['page'] — 페이지 1로 리셋. */
  clearOnChange?: readonly string[];
  className?: string;
}

/**
 * URL 기반 탭. 각 탭은 `<Link>` 라 JS 없이도 동작하고 prefetch 가능.
 */
export function Tabs({
  items,
  activeValue,
  pathname,
  searchParams,
  paramKey = 'tab',
  clearOnChange = ['page'],
  className,
}: TabsProps) {
  return (
    <div
      className={cn('inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1', className)}
      role='tablist'
    >
      {items.map((item) => {
        const patch: Record<string, string | null> = { [paramKey]: item.value };
        for (const key of clearOnChange) patch[key] = null;
        const href = buildListHref(pathname, searchParams, patch);
        const isActive = item.value === activeValue;
        return (
          <Link
            key={item.value}
            href={href}
            scroll={false}
            role='tab'
            aria-selected={isActive}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              isActive ? 'text-primary bg-white shadow-sm' : 'text-text-muted hover:text-text',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  isActive ? 'bg-primary/10 text-primary' : 'text-text-muted bg-white/60',
                )}
              >
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
