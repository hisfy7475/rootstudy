'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { DashboardStats } from '@/components/admin/dashboard-stats';
import { StudentTable } from '@/components/admin/student-table';
import { getAllStudents } from '@/lib/actions/admin';
import { createClient } from '@/lib/supabase/client';
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
}

const filterButtons: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'checked_in', label: '입실' },
  { value: 'checked_out', label: '퇴실' },
  { value: 'on_break', label: '외출' },
];

export function DashboardClient({ initialStudents, branchId }: DashboardClientProps) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(false);

  // 필터링된 학생 목록
  const filteredStudents = filter === 'all'
    ? students
    : students.filter(s => s.status === filter);

  // 통계 계산
  const stats = {
    total: students.length,
    checkedIn: students.filter(s => s.status === 'checked_in').length,
    checkedOut: students.filter(s => s.status === 'checked_out').length,
    onBreak: students.filter(s => s.status === 'on_break').length,
  };

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllStudents(undefined, branchId);
      setStudents(data);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-dashboard-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => handleRefresh(), 500);
      })
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [handleRefresh]);

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">학생 현황</h1>
          <p className="text-text-muted mt-1">실시간 학생 상태를 확인하세요</p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* 통계 카드 */}
      <DashboardStats {...stats} />

      {/* 필터 버튼 */}
      <div className="flex gap-2">
        {filterButtons.map((btn) => (
          <Button
            key={btn.value}
            variant={filter === btn.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(btn.value)}
          >
            {btn.label}
            {btn.value !== 'all' && (
              <span className="ml-1 text-xs opacity-70">
                ({btn.value === 'checked_in' ? stats.checkedIn : 
                  btn.value === 'checked_out' ? stats.checkedOut : stats.onBreak})
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* 학생 테이블 */}
      <StudentTable students={filteredStudents} />
    </div>
  );
}
