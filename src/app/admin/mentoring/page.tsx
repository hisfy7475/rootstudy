import Link from 'next/link';
import { Plus, Users, X } from 'lucide-react';
import {
  getAdminMentoringSlotDetail,
  getAdminMentoringSlotsForRange,
  getMentoringApplicationsForSlotAdmin,
  getMentorsForAdmin,
} from '@/lib/actions/mentoring';
import { getAllBranches } from '@/lib/actions/branch';
import { getUserScope } from '@/lib/auth/scope';
import { monthRangeYmd, getMondayOfWeekKST } from '@/lib/mentoring-calendar';
import { getTodayKST, getWeekDateStringsFromMondayKST, formatDateKST, cn } from '@/lib/utils';
import { AdminMentoringWeekClient } from './mentoring-client';
import { AdminMentoringMonthClient } from './mentoring-month-client';
import { SlotCreateForm } from './side-panel/slot-create-form';
import { SlotDetailPanel } from './side-panel/slot-detail-panel';
import { MentorFilter } from './mentor-filter';
import { Card } from '@/components/ui/card';

function addDaysKstYmd(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd.split('T')[0]}T12:00:00+09:00`);
  return formatDateKST(new Date(d.getTime() + deltaDays * 86400000));
}

type View = 'week' | 'month';

type PageProps = {
  searchParams: Promise<{
    view?: string;
    w?: string;
    y?: string;
    m?: string;
    mentor?: string;
    slot?: string;
    new?: string;
    date?: string;
  }>;
};

export default async function AdminMentoringPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  const view: View = sp.view === 'week' ? 'week' : 'month';
  const today = getTodayKST();
  const [ty, tm] = today.split('-').map(Number);

  // ----- 기간 계산 -----
  let fromYmd: string;
  let toYmd: string;
  let monday: string | null = null;
  let weekDates: string[] = [];
  let year = ty;
  let month = tm;
  if (view === 'week') {
    monday = sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? sp.w : getMondayOfWeekKST(today);
    weekDates = getWeekDateStringsFromMondayKST(monday);
    fromYmd = weekDates[0];
    toYmd = weekDates[6];
  } else {
    year = sp.y ? Math.min(2100, Math.max(2020, parseInt(sp.y, 10) || ty)) : ty;
    month = sp.m ? Math.min(12, Math.max(1, parseInt(sp.m, 10) || tm)) : tm;
    const r = monthRangeYmd(year, month);
    fromYmd = r.fromYmd;
    toYmd = r.toYmd;
  }

  // ----- 데이터 fetch -----
  const [rawSlots, mentors, branches, scope] = await Promise.all([
    getAdminMentoringSlotsForRange(fromYmd, toYmd),
    getMentorsForAdmin(),
    getAllBranches(true),
    getUserScope(),
  ]);
  // 실제 슈퍼관리자 여부(프로필 is_super_admin). 학생 검색을 전 지점으로 확장할지 판단.
  const isSuperAdmin = !!scope?.isSuperAdmin;

  // 멘토 필터 (클라이언트 측 필터 — slot 수가 한 달 ~ 수백 단위)
  const mentorFilter = sp.mentor && sp.mentor !== 'all' ? sp.mentor : null;
  const slots = mentorFilter ? rawSlots.filter((s) => s.mentor_id === mentorFilter) : rawSlots;

  const branchNamesById: Record<string, string> = {};
  for (const b of branches) branchNamesById[b.id] = b.name;
  // 슈퍼관리자 판별 휴리스틱: 보이는 멘토의 branch_id 가 2개 이상이면 슈퍼관리자.
  const uniqueMentorBranches = new Set(mentors.map((m) => m.branch_id));
  const isMultiBranchView = uniqueMentorBranches.size > 1;

  // ----- 사이드 패널 모드 결정 -----
  // 우선순위: slot > new > 기본(등록 모드)
  let panelMode: 'detail' | 'create' = 'create';
  let panelSlot: Awaited<ReturnType<typeof getAdminMentoringSlotDetail>> = null;
  let panelApplications: Awaited<ReturnType<typeof getMentoringApplicationsForSlotAdmin>> = [];
  let panelError: string | null = null;

  if (sp.slot && /^[0-9a-fA-F-]{36}$/.test(sp.slot)) {
    panelSlot = await getAdminMentoringSlotDetail(sp.slot);
    if (panelSlot) {
      panelMode = 'detail';
      panelApplications = await getMentoringApplicationsForSlotAdmin(sp.slot);
    } else {
      panelError = '슬롯을 찾을 수 없습니다.';
    }
  }

  const defaultPanelDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : (monday ?? `${year}-${String(month).padStart(2, '0')}-01`);

  // 캘린더에서 강조할 "현재 선택된 날짜/슬롯"을 URL 에서 도출.
  // 1) ?slot=<id> 가 있고 슬롯이 존재 → 그 슬롯의 date 와 id
  // 2) ?new=1&date=<ymd> → 그 date
  // 3) 없음
  const selectedYmd: string | null = panelSlot
    ? panelSlot.date
    : sp.new === '1' && sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : null;
  const selectedSlotId: string | null = panelSlot ? panelSlot.id : null;

  const todayYmd = today;

  // ----- 헤더 네비 URL 빌더 -----
  const preserve = new URLSearchParams();
  preserve.set('view', view);
  if (mentorFilter) preserve.set('mentor', mentorFilter);
  if (view === 'week' && monday) preserve.set('w', monday);
  if (view === 'month') {
    preserve.set('y', String(year));
    preserve.set('m', String(month));
  }

  function buildHref(overrides: Record<string, string | null>): string {
    const p = new URLSearchParams(preserve);
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    return `/admin/mentoring?${p.toString()}`;
  }

  // 이전/다음 (뷰 의존)
  let prevHref: string;
  let nextHref: string;
  if (view === 'week' && monday) {
    prevHref = buildHref({ w: addDaysKstYmd(monday, -7), slot: null, new: null, date: null });
    nextHref = buildHref({ w: addDaysKstYmd(monday, 7), slot: null, new: null, date: null });
  } else {
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    prevHref = buildHref({
      y: String(prev.y),
      m: String(prev.m),
      slot: null,
      new: null,
      date: null,
    });
    nextHref = buildHref({
      y: String(next.y),
      m: String(next.m),
      slot: null,
      new: null,
      date: null,
    });
  }

  const subTitle = view === 'week' ? `${fromYmd} ~ ${toYmd} (KST)` : `${year}년 ${month}월`;

  return (
    <div className='space-y-6 p-6'>
      <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>멘토링/클리닉/상담 일정</h1>
          <p className='text-muted-foreground mt-1 text-sm'>{subTitle}</p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {/* 뷰 토글 */}
          <div className='inline-flex rounded-2xl border p-0.5'>
            <Link
              href={buildHref({
                view: 'week',
                y: null,
                m: null,
                w: null,
                slot: null,
                new: null,
                date: null,
              })}
              className={cn(
                'rounded-xl px-3 py-1.5 text-sm font-medium',
                view === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              주간
            </Link>
            <Link
              href={buildHref({ view: 'month', w: null, slot: null, new: null, date: null })}
              className={cn(
                'rounded-xl px-3 py-1.5 text-sm font-medium',
                view === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              월간
            </Link>
          </div>

          {/* 멘토 필터 */}
          <MentorFilter mentors={mentors} value={mentorFilter ?? 'all'} />

          <Link
            href={prevHref}
            className='hover:bg-muted rounded-2xl border px-3 py-1.5 text-sm font-medium'
          >
            {view === 'week' ? '이전 주' : '이전 달'}
          </Link>
          <Link
            href={nextHref}
            className='hover:bg-muted rounded-2xl border px-3 py-1.5 text-sm font-medium'
          >
            {view === 'week' ? '다음 주' : '다음 달'}
          </Link>
          <Link
            href='/admin/mentoring/applications'
            className='hover:bg-muted inline-flex items-center gap-1 rounded-2xl border px-3 py-1.5 text-sm font-medium'
          >
            전체 신청
          </Link>
          <Link
            href='/admin/mentoring/mentors'
            className='hover:bg-muted inline-flex items-center gap-1 rounded-2xl border px-3 py-1.5 text-sm font-medium'
          >
            <Users className='size-4' />
            멘토 관리
          </Link>
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-[1fr_minmax(420px,440px)]'>
        {/* 좌측: 캘린더 */}
        <div className='min-w-0'>
          {view === 'week' && monday ? (
            <AdminMentoringWeekClient
              weekDates={weekDates}
              mondayYmd={monday}
              initialSlots={slots}
              preserveParams={preserve}
              selectedYmd={selectedYmd}
              selectedSlotId={selectedSlotId}
              todayYmd={todayYmd}
            />
          ) : (
            <AdminMentoringMonthClient
              year={year}
              month={month}
              initialSlots={slots}
              preserveParams={preserve}
              showBranchInChip={isMultiBranchView}
              branchNamesById={branchNamesById}
              selectedYmd={selectedYmd}
              selectedSlotId={selectedSlotId}
              todayYmd={todayYmd}
            />
          )}
        </div>

        {/* 우측: 사이드 패널 */}
        <aside className='min-w-0'>
          <Card className='space-y-4 p-4'>
            <div className='flex items-center justify-between gap-2'>
              <h2 className='text-base font-semibold'>
                {panelMode === 'detail' ? '슬롯 상세' : '슬롯 등록'}
              </h2>
              <div className='flex items-center gap-1'>
                {panelMode === 'detail' && (
                  <>
                    <Link
                      href={buildHref({ slot: null, new: '1', date: defaultPanelDate })}
                      className='text-primary hover:bg-muted inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium'
                    >
                      <Plus className='size-3.5' />새 슬롯
                    </Link>
                    <Link
                      href={buildHref({ slot: null, new: null, date: null })}
                      className='text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5'
                      title='패널 닫기'
                    >
                      <X className='size-4' />
                    </Link>
                  </>
                )}
              </div>
            </div>
            {panelError && (
              <p className='text-destructive text-sm'>{panelError} 다시 선택해 주세요.</p>
            )}
            {panelMode === 'detail' && panelSlot ? (
              <SlotDetailPanel
                slot={panelSlot}
                initialApplications={panelApplications}
                mentors={mentors}
                isSuperAdmin={isSuperAdmin}
              />
            ) : (
              <SlotCreateForm
                mentors={mentors}
                defaultDate={defaultPanelDate}
                defaultMentorId={mentorFilter}
              />
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
