'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import type { MentoringSlot, Mentor, MentoringType } from '@/types/database';

export type AdminWeekSlot = MentoringSlot & {
  mentors: Pick<
    Mentor,
    'id' | 'name' | 'subject' | 'subjects' | 'headline' | 'profile_image_url' | 'is_active'
  > | null;
};

const weekdayShort = ['월', '화', '수', '목', '금', '토', '일'];

export const TYPE_TONE: Record<MentoringType, string> = {
  mentoring: 'border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30',
  clinic: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30',
  consult: 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30',
};

export const TYPE_TONE_SOLID: Record<MentoringType, string> = {
  mentoring: 'bg-blue-500 text-white dark:bg-blue-600',
  clinic: 'bg-emerald-500 text-white dark:bg-emerald-600',
  consult: 'bg-amber-500 text-white dark:bg-amber-600',
};

function formatTimeShort(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/**
 * 캘린더 (주간/월간) 안에서 슬롯 한 개를 표시하는 공통 카드.
 * 클릭 시 ?slot=<id> 로 URL 쿼리를 갱신하고 사이드 패널을 상세 모드로 전환한다.
 */
export function AdminSlotItem({
  slot,
  hrefBase,
  preserveParams,
  isActive = false,
}: {
  slot: AdminWeekSlot;
  /** 예: /admin/mentoring */
  hrefBase: string;
  /** 유지할 기존 쿼리 (view/y/m/w/mentor 등) */
  preserveParams: URLSearchParams;
  /** 현재 사이드 패널에 열려 있는 슬롯이면 강조 */
  isActive?: boolean;
}) {
  const full = slot.booked_count >= slot.capacity;
  const inactive = !slot.is_active || !slot.mentors?.is_active;
  const params = new URLSearchParams(preserveParams);
  params.set('slot', slot.id);
  params.delete('new');
  params.delete('date');
  const href = `${hrefBase}?${params.toString()}`;

  return (
    <Link
      href={href}
      scroll={false}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'hover:bg-muted/50 block rounded-xl border p-2 text-xs transition-colors',
        TYPE_TONE[slot.type],
        inactive && 'opacity-60',
        full && !isActive && 'ring-1 ring-amber-400/60',
        isActive && 'ring-primary ring-2',
      )}
    >
      <div className='font-medium'>
        {formatTimeShort(String(slot.start_time))}–{formatTimeShort(String(slot.end_time))}
      </div>
      <div className='text-muted-foreground truncate'>
        {slot.mentors?.name ?? '멘토'} · {MENTORING_TYPE_LABEL[slot.type]}
      </div>
      <div className='text-muted-foreground truncate'>{slot.subject?.trim() || '—'}</div>
      <div className='mt-1 font-medium'>
        신청 {slot.booked_count}/{slot.capacity}
        {full ? ' · 만석' : ''}
      </div>
    </Link>
  );
}

interface AdminMentoringWeekClientProps {
  weekDates: string[];
  mondayYmd: string;
  initialSlots: AdminWeekSlot[];
  preserveParams: URLSearchParams;
  selectedYmd?: string | null;
  selectedSlotId?: string | null;
  todayYmd?: string;
}

export function AdminMentoringWeekClient({
  weekDates,
  initialSlots,
  preserveParams,
  selectedYmd = null,
  selectedSlotId = null,
  todayYmd,
}: AdminMentoringWeekClientProps) {
  const router = useRouter();

  function newSlotHref(ymd: string): string {
    const p = new URLSearchParams(preserveParams);
    p.set('new', '1');
    p.set('date', ymd);
    p.delete('slot');
    return `/admin/mentoring?${p.toString()}`;
  }

  const byDate = new Map<string, AdminWeekSlot[]>();
  for (const d of weekDates) {
    byDate.set(d, []);
  }
  for (const s of initialSlots) {
    const arr = byDate.get(s.date);
    if (arr) arr.push(s);
  }
  for (const arr of byDate.values()) {
    arr.sort((a, b) => {
      const t = a.start_time.localeCompare(b.start_time);
      if (t !== 0) return t;
      return (a.mentors?.name ?? '').localeCompare(b.mentors?.name ?? '');
    });
  }

  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7'>
      {weekDates.map((ymd, i) => {
        const slots = byDate.get(ymd) ?? [];
        const isToday = todayYmd === ymd;
        const header = new Date(`${ymd}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
          timeZone: 'Asia/Seoul',
          month: 'numeric',
          day: 'numeric',
        });
        const isSelected = selectedYmd === ymd;
        return (
          <Card
            key={ymd}
            onClick={() => router.push(newSlotHref(ymd), { scroll: false })}
            role='button'
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                router.push(newSlotHref(ymd), { scroll: false });
              }
            }}
            title='이 날짜에 슬롯 등록'
            className={cn(
              'hover:bg-muted/30 flex cursor-pointer flex-col overflow-hidden p-0 transition-colors',
              isToday && 'border-primary/60 ring-primary/30 ring-1',
              isSelected && 'ring-primary ring-2',
            )}
          >
            <div className={cn('bg-muted/60 border-b px-3 py-2', isToday && 'bg-primary/10')}>
              <div className={cn('text-sm font-semibold', isToday && 'text-primary')}>
                {weekdayShort[i]} {header}
                {isToday && <span className='ml-1 text-xs font-normal'>(오늘)</span>}
              </div>
              <div className='text-muted-foreground text-xs'>{ymd}</div>
            </div>
            <div className='flex min-h-[120px] flex-1 flex-col gap-2 p-2'>
              {slots.length === 0 ? (
                <p className='text-muted-foreground p-2 text-xs'>일정 없음 · 클릭하여 등록</p>
              ) : (
                slots.map((s) => (
                  <AdminSlotItem
                    key={s.id}
                    slot={s}
                    hrefBase='/admin/mentoring'
                    preserveParams={preserveParams}
                    isActive={selectedSlotId === s.id}
                  />
                ))
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
