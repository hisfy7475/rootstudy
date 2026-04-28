'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { MentoringSlotWithMentor } from '@/lib/actions/mentoring';
import { kstDaysInMonth, kstWeekday } from '@/lib/mentoring-calendar';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MentoringType } from '@/types/database';

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const TYPE_TONE: Record<MentoringType, string> = {
  mentoring:
    'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100',
  clinic:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  consult:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
};

function buildMentorSubtitle(slot: MentoringSlotWithMentor): string {
  const m = slot.mentors;
  if (!m) return '';
  if (slot.type === 'clinic') {
    const list = (m.subjects ?? []).filter(Boolean);
    if (list.length > 0) return `(${list.join(', ')})`;
    if (m.subject) return `(${m.subject})`;
    return '과목 미정';
  }
  // mentoring / consult
  return m.headline ?? '';
}

type MentorGroup = {
  mentorKey: string;
  mentorName: string;
  type: MentoringType;
  subtitle: string;
  slots: MentoringSlotWithMentor[];
};

function groupSlotsByMentorAndType(slots: MentoringSlotWithMentor[]): MentorGroup[] {
  const map = new Map<string, MentorGroup>();
  for (const s of slots) {
    const mentorId = s.mentor_id;
    const key = `${mentorId}:${s.type}`;
    let group = map.get(key);
    if (!group) {
      group = {
        mentorKey: key,
        mentorName: s.mentors?.name ?? '멘토',
        type: s.type,
        subtitle: buildMentorSubtitle(s),
        slots: [],
      };
      map.set(key, group);
    }
    group.slots.push(s);
  }
  for (const g of map.values()) {
    g.slots.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return [...map.values()].sort((a, b) => {
    // type 순서 고정 (mentoring → clinic → consult)
    const order: Record<MentoringType, number> = { mentoring: 0, clinic: 1, consult: 2 };
    if (a.type !== b.type) return order[a.type] - order[b.type];
    return a.mentorName.localeCompare(b.mentorName);
  });
}

export function MentoringCalendarClient({
  initialSlots,
  year,
  month,
  basePath,
  selectedStudentId,
  forQueryKey = 'for',
}: {
  initialSlots: MentoringSlotWithMentor[];
  year: number;
  month: number;
  basePath: string;
  /** 학부모: 신청 링크에 붙일 학생 ID */
  selectedStudentId?: string | null;
  forQueryKey?: string;
}) {
  // 월/년이 바뀌면 선택된 일자를 초기화한다.
  // 공식 React 권고: useEffect+setState 가 아니라 렌더 중 비교 → setState 패턴 사용.
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  const monthKey = `${year}-${month}`;
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [prevMonthKey, setPrevMonthKey] = useState(monthKey);
  if (prevMonthKey !== monthKey) {
    setPrevMonthKey(monthKey);
    setSelectedYmd(null);
  }

  const slotsByDate = useMemo(() => {
    const m = new Map<string, MentoringSlotWithMentor[]>();
    for (const s of initialSlots) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    return m;
  }, [initialSlots]);

  const dim = kstDaysInMonth(year, month);
  const firstWd = kstWeekday(year, month, 1);
  const leading = firstWd;
  const cells: ({ day: number } | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push({ day: d });

  const ymd = (d: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const monthLabel = `${year}년 ${month}월`;

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const applyQuery =
    selectedStudentId != null && selectedStudentId !== ''
      ? `?${forQueryKey}=${encodeURIComponent(selectedStudentId)}`
      : '';

  const dailyGroups = useMemo(() => {
    if (selectedYmd == null) return [] as MentorGroup[];
    const list = slotsByDate.get(selectedYmd) ?? [];
    return groupSlotsByMentorAndType(list);
  }, [selectedYmd, slotsByDate]);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <Link
          href={`${basePath}?y=${prev.y}&m=${prev.m}`}
          className='border-border text-muted-foreground hover:bg-muted rounded-lg border p-2'
          scroll={false}
        >
          <ChevronLeft className='h-5 w-5' />
        </Link>
        <span className='text-base font-semibold'>{monthLabel}</span>
        <Link
          href={`${basePath}?y=${next.y}&m=${next.m}`}
          className='border-border text-muted-foreground hover:bg-muted rounded-lg border p-2'
          scroll={false}
        >
          <ChevronRight className='h-5 w-5' />
        </Link>
      </div>

      <div className='text-muted-foreground grid grid-cols-7 gap-1 text-center text-xs'>
        {WEEK_LABELS.map((w) => (
          <div key={w} className='py-1 font-medium'>
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`e-${i}`} className='aspect-square' />;
          const key = ymd(c.day);
          const has = (slotsByDate.get(key)?.length ?? 0) > 0;
          const isSel = selectedYmd === key;
          return (
            <button
              key={key}
              type='button'
              onClick={() => setSelectedYmd(key)}
              className={cn(
                'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors',
                has ? 'bg-primary/10 text-primary font-medium' : 'text-foreground',
                isSel && 'ring-primary ring-offset-background ring-2 ring-offset-2',
              )}
            >
              <span>{c.day}</span>
              {has && <span className='bg-primary h-1 w-1 rounded-full' />}
            </button>
          );
        })}
      </div>

      {selectedYmd && (
        <div>
          <h2 className='text-foreground mb-2 text-sm font-semibold'>{selectedYmd}</h2>
          {dailyGroups.length === 0 ? (
            <Card className='text-muted-foreground p-4 text-center text-sm'>
              이 날짜에 열린 슬롯이 없습니다.
            </Card>
          ) : (
            <ul className='space-y-3'>
              {dailyGroups.map((g) => (
                <li key={g.mentorKey}>
                  <Card className='p-4'>
                    <div className='flex items-start gap-3'>
                      <div className='bg-muted size-12 shrink-0 overflow-hidden rounded-full'>
                        {g.slots[0].mentors?.profile_image_url ? (
                          <Image
                            src={g.slots[0].mentors.profile_image_url}
                            alt={g.mentorName}
                            width={48}
                            height={48}
                            unoptimized
                            className='size-full object-cover'
                          />
                        ) : null}
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-center gap-1.5'>
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-xs font-medium',
                              TYPE_TONE[g.type],
                            )}
                          >
                            [{MENTORING_TYPE_LABEL[g.type]}]
                          </span>
                          <span className='text-muted-foreground text-xs'>{selectedYmd}</span>
                        </div>
                        <p className='mt-1 font-medium'>
                          {g.mentorName}
                          {g.subtitle && (
                            <span className='text-foreground/80 ml-1 font-normal'>
                              {g.subtitle}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {g.slots.map((s) => {
                        const left = Math.max(0, s.capacity - s.booked_count);
                        const canApply = left > 0;
                        const time = s.start_time.slice(0, 5);
                        return (
                          <Link
                            key={s.id}
                            href={canApply ? `${basePath}/${s.id}/apply${applyQuery}` : '#'}
                            onClick={(e) => {
                              if (!canApply) e.preventDefault();
                            }}
                            className={cn(
                              'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                              canApply
                                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                                : 'border-border bg-muted text-muted-foreground pointer-events-none line-through',
                            )}
                            title={canApply ? `${time} (${left}/${s.capacity}석)` : `${time} 만석`}
                          >
                            {time}
                          </Link>
                        );
                      })}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
