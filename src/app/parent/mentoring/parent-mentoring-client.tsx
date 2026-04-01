'use client';

import { useState } from 'react';
import type { LinkedStudent } from '@/lib/actions/parent';
import type { MentoringSlotWithMentor } from '@/lib/actions/mentoring';
import { MentoringCalendarClient } from '@/app/student/(shell)/mentoring/mentoring-client';
import { cn } from '@/lib/utils';

export function ParentMentoringClient({
  initialSlots,
  year,
  month,
  students,
}: {
  initialSlots: MentoringSlotWithMentor[];
  year: number;
  month: number;
  students: LinkedStudent[];
}) {
  const [selectedId, setSelectedId] = useState(students[0]?.id ?? '');

  if (students.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        연결된 자녀가 없습니다. 학부모 메뉴에서 자녀를 연결한 뒤 이용해 주세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedId(s.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              selectedId === s.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <MentoringCalendarClient
        initialSlots={initialSlots}
        year={year}
        month={month}
        basePath="/parent/mentoring"
        selectedStudentId={selectedId}
      />
    </div>
  );
}
