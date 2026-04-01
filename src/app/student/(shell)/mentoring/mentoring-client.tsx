'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { MentoringSlotWithMentor } from '@/lib/actions/mentoring';
import { kstDaysInMonth, kstWeekday } from '@/lib/mentoring-calendar';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function typeLabel(t: MentoringSlotWithMentor['type']): string {
  return t === 'clinic' ? '클리닉' : '멘토링';
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
  const [slots, setSlots] = useState(initialSlots);
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);

  useEffect(() => {
    setSlots(initialSlots);
    setSelectedYmd(null);
  }, [initialSlots, year, month]);

  const slotsByDate = useMemo(() => {
    const m = new Map<string, MentoringSlotWithMentor[]>();
    for (const s of slots) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return m;
  }, [slots]);

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

  const listForSelected =
    selectedYmd != null ? (slotsByDate.get(selectedYmd) ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`${basePath}?y=${prev.y}&m=${prev.m}`}
          className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-muted"
          scroll={false}
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <span className="text-base font-semibold">{monthLabel}</span>
        <Link
          href={`${basePath}?y=${next.y}&m=${next.m}`}
          className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-muted"
          scroll={false}
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEK_LABELS.map((w) => (
          <div key={w} className="py-1 font-medium">
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`e-${i}`} className="aspect-square" />;
          const key = ymd(c.day);
          const has = (slotsByDate.get(key)?.length ?? 0) > 0;
          const isSel = selectedYmd === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedYmd(key)}
              className={cn(
                'aspect-square rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 transition-colors',
                has ? 'bg-primary/10 font-medium text-primary' : 'text-foreground',
                isSel && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              )}
            >
              <span>{c.day}</span>
              {has && <span className="w-1 h-1 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>

      {selectedYmd && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-2">
            {selectedYmd} 슬롯
          </h2>
          {listForSelected.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground text-center">
              이 날짜에 열린 슬롯이 없습니다.
            </Card>
          ) : (
            <ul className="space-y-2">
              {listForSelected.map((s) => {
                const left = Math.max(0, s.capacity - s.booked_count);
                const canApply = left > 0;
                return (
                  <li key={s.id}>
                    <Link
                      href={
                        canApply
                          ? `${basePath}/${s.id}/apply${applyQuery}`
                          : '#'
                      }
                      className={cn(!canApply && 'pointer-events-none opacity-60')}
                      onClick={(e) => {
                        if (!canApply) e.preventDefault();
                      }}
                    >
                      <Card className="p-3 active:scale-[0.99] transition-transform">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                                {typeLabel(s.type)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                              </span>
                            </div>
                            <p className="font-medium mt-1">
                              {s.mentors?.name ?? '멘토'} ·{' '}
                              {s.subject ?? s.mentors?.subject ?? '과목 미정'}
                            </p>
                            {s.location && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {s.location}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Users className="w-3.5 h-3.5" />
                            {left}/{s.capacity}
                          </div>
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
