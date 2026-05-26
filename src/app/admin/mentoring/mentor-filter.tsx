'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Mentor } from '@/types/database';

interface Props {
  mentors: Mentor[];
  value: string;
}

export function MentorFilter({ mentors, value }: Props) {
  const router = useRouter();
  const search = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(search.toString());
    if (next === 'all') params.delete('mentor');
    else params.set('mentor', next);
    // 패널 상태는 그대로 유지하지 않고 초기화(필터 후 컨텍스트가 달라짐)
    params.delete('slot');
    params.delete('new');
    params.delete('date');
    router.push(`/admin/mentoring?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className='border-input rounded-2xl border px-3 py-1.5 text-sm'
    >
      <option value='all'>전체 멘토</option>
      {mentors.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
          {!m.is_active ? ' (비활성)' : ''}
        </option>
      ))}
    </select>
  );
}
