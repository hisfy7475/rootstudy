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
  // 활성(재원 중) 자녀 우선 선택. 퇴원 자녀가 첫 번째여도 신청 가능한 자녀로 시작.
  const [selectedId, setSelectedId] = useState(students.find((s) => !s.withdrawnAt)?.id ?? '');

  if (students.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        연결된 자녀가 없습니다. 학부모 메뉴에서 자녀를 연결한 뒤 이용해 주세요.
      </p>
    );
  }

  const hasActiveChild = students.some((s) => !s.withdrawnAt);
  const selectedStudent = students.find((s) => s.id === selectedId);
  const selectedWithdrawn = !!selectedStudent?.withdrawnAt;

  if (!hasActiveChild) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        신청 가능한(재원 중인) 자녀가 없습니다.
      </p>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap gap-2'>
        {students.map((s) => (
          <button
            key={s.id}
            type='button'
            onClick={() => setSelectedId(s.id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              selectedId === s.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {s.name}
            {s.withdrawnAt ? (
              <span className='ml-1 rounded bg-gray-200 px-1 text-[10px] text-gray-700'>퇴원</span>
            ) : null}
          </button>
        ))}
      </div>
      {selectedWithdrawn ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          퇴원한 자녀는 신규 멘토링 신청을 할 수 없습니다. 재원 중인 자녀를 선택해 주세요.
        </p>
      ) : (
        <MentoringCalendarClient
          initialSlots={initialSlots}
          year={year}
          month={month}
          basePath='/parent/mentoring'
          selectedStudentId={selectedId}
        />
      )}
    </div>
  );
}
