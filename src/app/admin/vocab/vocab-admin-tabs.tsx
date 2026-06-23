'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

type Tab = 'exams' | 'packs' | 'words';

const TABS: { key: Tab; label: string; href: string; superOnly: boolean }[] = [
  { key: 'exams', label: '응시내역', href: '/admin/vocab/exams', superOnly: false },
  { key: 'packs', label: '단어 꾸러미', href: '/admin/vocab/packs', superOnly: true },
  { key: 'words', label: '단어 관리', href: '/admin/vocab/words', superOnly: true },
];

export function VocabAdminTabs({ active, isSuperAdmin }: { active: Tab; isSuperAdmin: boolean }) {
  const visible = TABS.filter((t) => !t.superOnly || isSuperAdmin);
  return (
    <div className='flex gap-2 border-b border-gray-200'>
      {visible.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            active === t.key
              ? 'border-primary text-primary'
              : 'text-text-muted hover:text-text border-transparent',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
