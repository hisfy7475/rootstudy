'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { MentoringSlot, Mentor } from '@/types/database';

export type AdminWeekSlot = MentoringSlot & {
  mentors: Pick<Mentor, 'id' | 'name' | 'subject' | 'is_active'> | null;
};

const weekdayShort = ['월', '화', '수', '목', '금', '토', '일'];

const typeLabel = { mentoring: '멘토링', clinic: '클리닉' } as const;

function formatTimeShort(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

interface AdminMentoringWeekClientProps {
  weekDates: string[];
  mondayYmd: string;
  initialSlots: AdminWeekSlot[];
}

export function AdminMentoringWeekClient({
  weekDates,
  initialSlots,
}: AdminMentoringWeekClientProps) {
  const byDate = new Map<string, AdminWeekSlot[]>();
  for (const d of weekDates) {
    byDate.set(d, []);
  }
  for (const s of initialSlots) {
    const arr = byDate.get(s.date);
    if (arr) arr.push(s);
  }
  for (const arr of byDate.values()) {
    arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
      {weekDates.map((ymd, i) => {
        const slots = byDate.get(ymd) ?? [];
        const header = new Date(`${ymd}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
          timeZone: 'Asia/Seoul',
          month: 'numeric',
          day: 'numeric',
        });
        return (
          <Card key={ymd} className="flex flex-col overflow-hidden p-0">
            <div className="bg-muted/60 border-b px-3 py-2">
              <div className="text-sm font-semibold">
                {weekdayShort[i]} {header}
              </div>
              <div className="text-muted-foreground text-xs">{ymd}</div>
            </div>
            <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
              {slots.length === 0 ? (
                <p className="text-muted-foreground p-2 text-xs">일정 없음</p>
              ) : (
                slots.map((s) => {
                  const full = s.booked_count >= s.capacity;
                  const inactive = !s.is_active || !s.mentors?.is_active;
                  return (
                    <Link
                      key={s.id}
                      href={`/admin/mentoring/slots/${s.id}`}
                      className={cn(
                        'rounded-xl border p-2 text-xs transition-colors hover:bg-muted/50',
                        s.type === 'clinic'
                          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
                          : 'border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30',
                        inactive && 'opacity-60',
                        full && 'ring-1 ring-amber-400/60'
                      )}
                    >
                      <div className="font-medium">
                        {formatTimeShort(String(s.start_time))}–{formatTimeShort(String(s.end_time))}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {s.mentors?.name ?? '멘토'} · {typeLabel[s.type]}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {s.subject?.trim() || '—'}
                      </div>
                      <div className="mt-1 font-medium">
                        신청 {s.booked_count}/{s.capacity}
                        {full ? ' · 만석' : ''}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
