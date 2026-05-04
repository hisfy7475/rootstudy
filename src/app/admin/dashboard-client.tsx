'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DashboardStats } from '@/components/admin/dashboard-stats';
import { StudentTable } from '@/components/admin/student-table';
import { createClient } from '@/lib/supabase/client';
import { buildListHref } from '@/lib/list-params';
import { RefreshCw } from 'lucide-react';

type StatusFilter = 'all' | 'checked_in' | 'checked_out' | 'on_break';

interface Student {
  id: string;
  seatNumber: number | null;
  name: string;
  email: string;
  phone: string;
  status: 'checked_in' | 'checked_out' | 'on_break';
  checkInTime: string | null;
  totalStudySeconds: number;
  currentSubject: string | null;
  avgFocus: number | null;
}

interface DashboardClientProps {
  initialRows: Student[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    total: number;
    checkedIn: number;
    checkedOut: number;
    onBreak: number;
    notYetArrived: number;
  };
  branchId: string | null;
  initialStatusFilter: StatusFilter;
  initialQ: string;
}

const filterButtons: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'checked_in', label: '입실' },
  { value: 'checked_out', label: '퇴실' },
  { value: 'on_break', label: '외출' },
];

export function DashboardClient({
  initialRows,
  total,
  page,
  pageSize,
  stats,
  branchId,
  initialStatusFilter,
}: DashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const filter: StatusFilter = (sp.get('status') as StatusFilter) || initialStatusFilter;

  // 서버 측 검색·페이지네이션·정렬로 통일됨. 검색·필터 변경 시 URL 갱신 → 서버 컴포넌트 재실행.
  // stats 는 검색·status 와 무관한 branch 전체 기준으로 서버에서 분리 계산.

  function patchUrl(patch: Record<string, string | null>) {
    const href = buildListHref(pathname, new URLSearchParams(sp.toString()), patch);
    startTransition(() => router.replace(href, { scroll: false }));
  }

  // 새로고침 — 현재 URL 파라미터를 그대로 두고 서버 컴포넌트만 재실행
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleRefresh() {
    startTransition(() => router.refresh());
  }

  // Realtime — RLS 가 자동으로 자기 branch 변경만 통과시킨다고 가정.
  // attendance 테이블이 supabase_realtime publication 에 포함됐는지 사전 검증 필요.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-dashboard-attendance-${branchId ?? 'none'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          startTransition(() => router.refresh());
        }, 500);
      })
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [branchId, router]);

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>학생 현황</h1>
          <p className='text-text-muted mt-1'>실시간 학생 상태를 확인하세요</p>
        </div>
        <Button variant='outline' onClick={handleRefresh}>
          <RefreshCw className='mr-2 h-4 w-4' />
          새로고침
        </Button>
      </div>

      <DashboardStats {...stats} />

      <DataTableToolbar
        searchPlaceholder='이름·좌석번호 검색...'
        className='bg-transparent p-0 shadow-none'
      />

      {/* 상태 필터 버튼 */}
      <div className='flex gap-2'>
        {filterButtons.map((btn) => (
          <Button
            key={btn.value}
            variant={filter === btn.value ? 'default' : 'outline'}
            size='sm'
            onClick={() => patchUrl({ status: btn.value === 'all' ? null : btn.value, page: null })}
          >
            {btn.label}
            {btn.value !== 'all' && (
              <span className='ml-1 text-xs opacity-70'>
                (
                {btn.value === 'checked_in'
                  ? stats.checkedIn
                  : btn.value === 'checked_out'
                    ? stats.checkedOut
                    : stats.onBreak}
                )
              </span>
            )}
          </Button>
        ))}
      </div>

      <StudentTable students={initialRows} />

      <div className='flex justify-center'>
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          pathname={pathname}
          searchParams={new URLSearchParams(sp.toString())}
        />
      </div>
    </div>
  );
}
