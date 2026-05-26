'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import { kstDaysInMonth, kstWeekday } from '@/lib/mentoring-calendar';
import { AdminSlotItem, TYPE_TONE, TYPE_TONE_SOLID, type AdminWeekSlot } from './mentoring-client';

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function fmtTime(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

interface Props {
  year: number;
  month: number;
  initialSlots: AdminWeekSlot[];
  preserveParams: URLSearchParams;
  /** 슈퍼관리자에게만 지점명 칩이 의미 있음 (단일 지점 어드민은 자명). */
  showBranchInChip?: boolean;
  /** 슬롯별 branch_id → 지점명 약칭 */
  branchNamesById?: Record<string, string>;
  /** URL 에서 도출된 현재 선택 날짜/슬롯 (있으면 캘린더에 ring 강조) */
  selectedYmd?: string | null;
  selectedSlotId?: string | null;
  /** 오늘 (YYYY-MM-DD, KST) — 오늘 셀에 미세한 강조 */
  todayYmd?: string;
}

export function AdminMentoringMonthClient({
  year,
  month,
  initialSlots,
  preserveParams,
  showBranchInChip = false,
  branchNamesById = {},
  selectedYmd: urlSelectedYmd = null,
  selectedSlotId = null,
  todayYmd,
}: Props) {
  const router = useRouter();
  const monthKey = `${year}-${month}`;
  // URL 기반 선택이 우선. 사용자가 캘린더에서 셀만 클릭(슬롯 없는 셀이거나 셀 자체 클릭)한 로컬 선택은 보조.
  const [localSelectedYmd, setLocalSelectedYmd] = useState<string | null>(null);
  const [prevMonthKey, setPrevMonthKey] = useState(monthKey);
  if (prevMonthKey !== monthKey) {
    setPrevMonthKey(monthKey);
    setLocalSelectedYmd(null);
  }
  const selectedYmd = urlSelectedYmd ?? localSelectedYmd;
  const setSelectedYmd = setLocalSelectedYmd;

  const slotsByDate = useMemo(() => {
    const m = new Map<string, AdminWeekSlot[]>();
    for (const s of initialSlots) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const t = a.start_time.localeCompare(b.start_time);
        if (t !== 0) return t;
        return (a.mentors?.name ?? '').localeCompare(b.mentors?.name ?? '');
      });
    }
    return m;
  }, [initialSlots]);

  const dim = kstDaysInMonth(year, month);
  const firstWd = kstWeekday(year, month, 1);
  const leading = firstWd;
  const cells: ({ day: number } | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push({ day: d });
  // 6주 격자 완성용 trailing
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push(null);

  const ymdOf = (d: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  function newSlotHref(ymd: string): string {
    const params = new URLSearchParams(preserveParams);
    params.set('new', '1');
    params.set('date', ymd);
    params.delete('slot');
    return `/admin/mentoring?${params.toString()}`;
  }

  function slotDetailHref(slotId: string): string {
    const params = new URLSearchParams(preserveParams);
    params.set('slot', slotId);
    params.delete('new');
    params.delete('date');
    return `/admin/mentoring?${params.toString()}`;
  }

  const selectedSlots = selectedYmd ? (slotsByDate.get(selectedYmd) ?? []) : [];

  function handleCellClick(ymd: string) {
    setSelectedYmd(ymd);
    const slots = slotsByDate.get(ymd) ?? [];
    // 슬롯이 없는 빈 셀이면 등록 모드로 전환 (URL 갱신)
    if (slots.length === 0) {
      router.push(newSlotHref(ymd), { scroll: false });
    }
  }

  return (
    <div className='space-y-4'>
      {/* 데스크탑: 인라인 칩 캘린더 */}
      <div className='hidden md:block'>
        <div className='grid grid-cols-7 gap-1 text-xs'>
          {WEEK_LABELS.map((w) => (
            <div key={w} className='text-muted-foreground py-1 text-center font-medium'>
              {w}
            </div>
          ))}
          {cells.map((c, i) => {
            if (!c) return <div key={`e-${i}`} className='min-h-[120px]' />;
            const ymd = ymdOf(c.day);
            const slots = slotsByDate.get(ymd) ?? [];
            const visible = slots.slice(0, 4);
            const overflow = slots.length - visible.length;
            const isSelected = selectedYmd === ymd;
            const isToday = todayYmd === ymd;
            const cellClass = cn(
              'flex min-h-[120px] flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors',
              'hover:bg-muted/40',
              isToday && 'border-primary/60 bg-primary/5',
              isSelected && 'ring-primary ring-2',
            );
            const dayNumClass = cn(
              'text-xs font-medium',
              isToday ? 'text-primary font-bold' : 'text-foreground',
            );

            // 모든 셀: 클릭 = 슬롯 등록 모드 (날짜 사전 채움).
            // 칩 클릭은 stopPropagation 으로 별도 동작(상세 모드).
            return (
              <div
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
                className={cn(cellClass, 'cursor-pointer')}
              >
                <span className={dayNumClass}>{c.day}</span>
                <div className='flex flex-col gap-1'>
                  {visible.map((s) => {
                    const full = s.booked_count >= s.capacity;
                    const inactive = !s.is_active || !s.mentors?.is_active;
                    const isActiveSlot = selectedSlotId === s.id;
                    const branchAbbr = showBranchInChip
                      ? branchNamesById[s.branch_id]?.slice(0, 4)
                      : null;
                    const time = fmtTime(String(s.start_time));
                    const titleParts = [
                      branchAbbr ? `[${branchAbbr}]` : '',
                      `[${MENTORING_TYPE_LABEL[s.type]}]`,
                      time,
                      s.mentors?.name ?? '',
                      s.subject?.trim() ?? '',
                      `${s.booked_count}/${s.capacity}${full ? ' 만석' : ''}`,
                    ].filter(Boolean);
                    return (
                      <Link
                        key={s.id}
                        href={slotDetailHref(s.id)}
                        scroll={false}
                        onClick={(e) => e.stopPropagation()}
                        title={titleParts.join(' ')}
                        className={cn(
                          'truncate rounded px-1.5 py-0.5 text-[11px] font-medium',
                          full
                            ? TYPE_TONE_SOLID[s.type]
                            : `border ${TYPE_TONE[s.type]} text-foreground`,
                          inactive && 'opacity-60',
                          isActiveSlot && 'ring-primary ring-2 ring-offset-1',
                        )}
                      >
                        {branchAbbr ? `[${branchAbbr}]` : ''}[{MENTORING_TYPE_LABEL[s.type]}] {time}
                      </Link>
                    );
                  })}
                  {overflow > 0 && (
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedYmd(ymd);
                      }}
                      className='text-muted-foreground hover:text-foreground px-1.5 text-left text-[11px]'
                      title='그 외 슬롯 보기 (하단 리스트로 펼침)'
                    >
                      +{overflow}개 더보기
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 모바일: 점 표시 캘린더 + 셀 탭 시 일일 리스트 */}
      <div className='md:hidden'>
        <div className='grid grid-cols-7 gap-1 text-center text-xs'>
          {WEEK_LABELS.map((w) => (
            <div key={w} className='text-muted-foreground py-1 font-medium'>
              {w}
            </div>
          ))}
          {cells.map((c, i) => {
            if (!c) return <div key={`e-${i}`} className='aspect-square' />;
            const ymd = ymdOf(c.day);
            const slots = slotsByDate.get(ymd) ?? [];
            const has = slots.length > 0;
            const isSel = selectedYmd === ymd;
            const isToday = todayYmd === ymd;
            return (
              <button
                key={ymd}
                type='button'
                onClick={() => handleCellClick(ymd)}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors',
                  has ? 'bg-primary/10 text-primary font-medium' : 'text-foreground',
                  isToday && 'border-primary/60 border',
                  isSel && 'ring-primary ring-2',
                )}
              >
                <span className={cn(isToday && 'font-bold')}>{c.day}</span>
                {has && (
                  <span className='text-primary text-[10px] font-medium'>{slots.length}</span>
                )}
              </button>
            );
          })}
        </div>
        {selectedYmd && selectedSlots.length > 0 && (
          <div className='mt-4 space-y-2'>
            <h3 className='text-foreground text-sm font-semibold'>{selectedYmd}</h3>
            {selectedSlots.map((s) => (
              <AdminSlotItem
                key={s.id}
                slot={s}
                hrefBase='/admin/mentoring'
                preserveParams={preserveParams}
                isActive={selectedSlotId === s.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* 데스크탑에서 선택한 일자에 슬롯이 있을 때 보조 리스트 (사이드 패널 미오픈 상황 대비) */}
      {selectedYmd && selectedSlots.length > 0 && (
        <Card className='hidden p-3 md:block'>
          <h3 className='mb-2 text-sm font-semibold'>{selectedYmd} 일정</h3>
          <div className='grid grid-cols-2 gap-2 xl:grid-cols-3'>
            {selectedSlots.map((s) => (
              <AdminSlotItem
                key={s.id}
                slot={s}
                hrefBase='/admin/mentoring'
                preserveParams={preserveParams}
                isActive={selectedSlotId === s.id}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
