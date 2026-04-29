'use client';

import { useState, useEffect, useRef, useCallback, useTransition, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { DashboardStats } from '@/components/admin/dashboard-stats';
import { StudentTable } from '@/components/admin/student-table';
import { getAllStudents } from '@/lib/actions/admin';
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
  initialStudents: Student[];
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

const PAGE_SIZE = 50;

export function DashboardClient({
  initialStudents,
  branchId,
  initialStatusFilter,
  initialQ,
}: DashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [loading, setLoading] = useState(false);

  const filter: StatusFilter = (sp.get('status') as StatusFilter) || initialStatusFilter;
  const q = sp.get('q') ?? initialQ;
  const pageNum = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1);

  // 통계 — 전체 기준 (필터와 무관)
  const stats = useMemo(
    () => ({
      total: students.length,
      checkedIn: students.filter((s) => s.status === 'checked_in').length,
      checkedOut: students.filter((s) => s.status === 'checked_out').length,
      onBreak: students.filter((s) => s.status === 'on_break').length,
    }),
    [students],
  );

  // 클라이언트 측 필터 + 검색 + 페이지네이션 (학생 수가 지점당 50–200 으로 작아 OK)
  const filteredStudents = useMemo(() => {
    let result = filter === 'all' ? students : students.filter((s) => s.status === filter);
    if (q.trim()) {
      const ql = q.toLowerCase();
      result = result.filter(
        (s) => s.name.toLowerCase().includes(ql) || String(s.seatNumber ?? '').includes(ql),
      );
    }
    return result;
  }, [students, filter, q]);

  const total = filteredStudents.length;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageNum, lastPage);
  const pagedStudents = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function patchUrl(patch: Record<string, string | null>) {
    const href = buildListHref(pathname, new URLSearchParams(sp.toString()), patch);
    startTransition(() => router.replace(href, { scroll: false }));
  }

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllStudents(undefined, branchId);
      setStudents(data);
    } catch (e) {
      console.error('Failed to refresh:', e);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  // Realtime — RLS 가 자동으로 자기 branch 변경만 통과시킨다고 가정.
  // attendance 테이블이 supabase_realtime publication 에 포함됐는지 사전 검증 필요.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-dashboard-attendance-${branchId ?? 'none'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => handleRefresh(), 500);
      })
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [handleRefresh, branchId]);

  return (
    <div className='space-y-6 p-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>학생 현황</h1>
          <p className='text-text-muted mt-1'>실시간 학생 상태를 확인하세요</p>
        </div>
        <Button variant='outline' onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      <DashboardStats {...stats} />

      <DataTableToolbar
        searchPlaceholder='이름·좌석번호 검색...'
        hidePageSize
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

      <StudentTable students={pagedStudents} />

      <div className='flex justify-center'>
        <Pagination
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          pathname={pathname}
          searchParams={new URLSearchParams(sp.toString())}
        />
      </div>
    </div>
  );
}
