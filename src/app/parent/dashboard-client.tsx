'use client';

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import { StudentInfoCard } from '@/components/parent/student-info-card';
import { StudentStatusCard } from '@/components/parent/student-status-card';
import { WeeklyStudyProgress } from '@/components/student/weekly-study-progress';
import { ParentPointsCard } from '@/components/parent/parent-points-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ChevronRight,
  UserX,
  UserPlus,
  Settings,
  Clock,
  Calendar,
  User,
  Check,
  X,
  Repeat,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { DAY_NAMES } from '@/lib/constants';
import type { StudentAbsenceSchedule } from '@/types/database';
import { approveAbsenceSchedule, rejectAbsenceSchedule } from '@/lib/actions/absence-schedule';
import { getParentDashboardData } from '@/lib/actions/parent';
import { createClient } from '@/lib/supabase/client';
import { isPastOneTimeAbsenceSchedule } from '@/lib/utils';

type AttendanceStatus = 'checked_in' | 'checked_out' | 'on_break';

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  seatNumber: number | null;
}

interface WeeklyProgressData {
  goalHours: number;
  actualMinutes: number;
  progressPercent: number;
  studentTypeName: string | null;
}

interface WeeklyGoalDay {
  date: string;
  achieved: boolean | null;
}

interface StudentData {
  student: Student;
  status: AttendanceStatus;
  lastUpdate: string | null;
  studyTime: number;
  currentSubject: string | null;
  todayFocus: number | null;
  latestActivity: string | null;
  pendingSchedules: number;
  weeklyProgress: WeeklyProgressData;
  weeklyGoals: WeeklyGoalDay[];
  // 단계 7 학부모용 분기 표시
  penaltyQuarter?: number;
  penaltyThreshold?: number;
  quarterEnd?: string | null;
  withdrawalReviewAt?: string | null;
  rewardBalance?: number;
}

interface PendingScheduleWithStudent extends StudentAbsenceSchedule {
  student_name: string;
}

interface DashboardProps {
  students: StudentData[];
  pendingSchedules: PendingScheduleWithStudent[];
  /** 활성/퇴원 합산이 아니라 퇴원 자녀 수만. 0 이면 "연결된 자녀 자체가 없음" 상태와 구분된다. */
  withdrawnChildCount?: number;
}

export function ParentDashboardClient({
  students: initialStudents,
  pendingSchedules,
  withdrawnChildCount = 0,
}: DashboardProps) {
  const [students, setStudents] = useState(initialStudents);
  const [isPending, startTransition] = useTransition();

  const visiblePendingSchedules = useMemo(
    () =>
      pendingSchedules.filter(
        (s) => !isPastOneTimeAbsenceSchedule(s.is_recurring, s.specific_date),
      ),
    [pendingSchedules],
  );

  const refreshStudents = useCallback(async () => {
    try {
      const data = await getParentDashboardData();
      setStudents(data.students);
    } catch (error) {
      console.error('Failed to refresh students:', error);
    }
  }, []);

  // attendance 테이블 변경 시 자녀 상태 실시간 갱신
  useEffect(() => {
    if (initialStudents.length === 0) return;

    const studentIds = initialStudents.map((s) => s.student.id);
    const supabase = createClient();

    const channel = supabase
      .channel('parent-attendance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance',
          filter: `student_id=in.(${studentIds.join(',')})`,
        },
        () => {
          refreshStudents();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialStudents, refreshStudents]);

  const formatTimeRange = (start: string, end: string) => {
    return `${start.slice(0, 5)} ~ ${end.slice(0, 5)}`;
  };

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '매일';
    return days.map((d) => DAY_NAMES[d]).join(', ');
  };

  const handleApprove = async (scheduleId: string) => {
    startTransition(async () => {
      const result = await approveAbsenceSchedule(scheduleId);
      if (!result.success) {
        alert(result.error || '승인에 실패했습니다.');
      }
    });
  };

  const handleReject = async (scheduleId: string) => {
    if (!confirm('이 부재 일정 요청을 거부하시겠습니까?')) return;

    startTransition(async () => {
      const result = await rejectAbsenceSchedule(scheduleId);
      if (!result.success) {
        alert(result.error || '거부에 실패했습니다.');
      }
    });
  };

  // 활성 자녀가 없는 경우 — 연결 자체가 0명인지, 모두 퇴원되었는지 분기.
  if (students.length === 0) {
    const allWithdrawn = withdrawnChildCount > 0;
    return (
      <div className='p-4'>
        <Card className='p-8'>
          <div className='flex flex-col items-center justify-center text-center'>
            <div className='mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100'>
              <UserX className='h-10 w-10 text-gray-400' />
            </div>
            <h2 className='text-text mb-2 text-lg font-bold'>
              {allWithdrawn ? '활성 자녀가 없습니다' : '연결된 자녀가 없습니다'}
            </h2>
            <p className='text-text-muted mb-4 text-sm'>
              {allWithdrawn ? (
                <>
                  연결된 모든 자녀가 퇴원 처리되었습니다.
                  <br />
                  과거 결제·신청 이력은 「설정」에서 확인할 수 있습니다.
                </>
              ) : (
                <>
                  설정에서 자녀의 연결 코드를 입력하여
                  <br />
                  자녀와 연결해주세요.
                </>
              )}
            </p>
            <Link href='/parent/settings'>
              <button className='bg-primary hover:bg-primary/90 flex items-center gap-2 rounded-xl px-4 py-2 text-white transition-colors'>
                <UserPlus className='h-4 w-4' />
                <span>{allWithdrawn ? '자녀 관리로 이동' : '자녀 연결하기'}</span>
              </button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-4 p-4'>
      {/* 승인 대기 스케줄 */}
      {visiblePendingSchedules.length > 0 && (
        <Card className='border-amber-200 bg-amber-50/50 p-4'>
          <div className='mb-3 flex items-center gap-2'>
            <AlertCircle className='h-5 w-5 text-amber-500' />
            <h2 className='font-semibold text-gray-800'>승인 대기 중인 부재 일정</h2>
            <span className='rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'>
              {visiblePendingSchedules.length}건
            </span>
          </div>
          <div className='space-y-2'>
            {visiblePendingSchedules.map((schedule) => (
              <div key={schedule.id} className='rounded-xl border border-amber-100 bg-white p-3'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='flex min-w-0 flex-1 items-start gap-2'>
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                        schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100'
                      }`}
                    >
                      {schedule.is_recurring ? (
                        <Repeat className='text-primary h-4 w-4' />
                      ) : (
                        <CalendarDays className='h-4 w-4 text-amber-600' />
                      )}
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-sm font-medium text-gray-800'>
                        {schedule.title}
                      </div>
                      <div className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500'>
                        <span className='flex items-center gap-0.5'>
                          <User className='h-3 w-3' />
                          {schedule.student_name}
                        </span>
                        <span className='flex items-center gap-0.5'>
                          <Clock className='h-3 w-3' />
                          {formatTimeRange(schedule.start_time, schedule.end_time)}
                        </span>
                        <span className='flex items-center gap-0.5'>
                          <Calendar className='h-3 w-3' />
                          {schedule.is_recurring
                            ? formatDaysOfWeek(schedule.day_of_week)
                            : schedule.specific_date
                              ? format(new Date(schedule.specific_date), 'M/d', { locale: ko })
                              : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className='flex flex-shrink-0 gap-1.5'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => handleReject(schedule.id)}
                      disabled={isPending}
                      className='h-8 border-red-200 px-2 text-red-600 hover:bg-red-50'
                    >
                      <X className='h-4 w-4' />
                    </Button>
                    <Button
                      size='sm'
                      onClick={() => handleApprove(schedule.id)}
                      disabled={isPending}
                      className='bg-primary hover:bg-primary/90 h-8 px-2'
                    >
                      <Check className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link href='/parent/schedule' className='mt-3 block'>
            <div className='flex items-center justify-center gap-1 text-sm text-amber-700 hover:text-amber-800'>
              <span>전체 일정 관리</span>
              <ChevronRight className='h-4 w-4' />
            </div>
          </Link>
        </Card>
      )}

      {/* 자녀별 카드 */}
      {students.map((data, index) => (
        <div key={data.student.id} className='space-y-3'>
          {/* 자녀 구분 헤더 (여러 자녀일 때만) */}
          {students.length > 1 && (
            <div className='flex items-center gap-2 pt-2'>
              <div className='bg-primary/10 flex h-6 w-6 items-center justify-center rounded-full'>
                <span className='text-primary text-xs font-bold'>{index + 1}</span>
              </div>
              <span className='text-text-muted text-sm font-medium'>{data.student.name}</span>
            </div>
          )}

          {/* 학생 정보 카드 */}
          <StudentInfoCard
            name={data.student.name}
            seatNumber={data.student.seatNumber}
            phone={data.student.phone}
          />

          {/* 학생 상태 카드 */}
          <StudentStatusCard
            status={data.status}
            studyTimeSeconds={data.studyTime}
            currentSubject={data.currentSubject}
            focusScore={data.todayFocus}
            latestActivity={data.latestActivity}
            lastUpdate={data.lastUpdate}
          />

          {/* 주간 학습 현황 */}
          <WeeklyStudyProgress
            goalHours={data.weeklyProgress.goalHours}
            actualMinutes={data.weeklyProgress.actualMinutes}
            progressPercent={data.weeklyProgress.progressPercent}
            studentTypeName={data.weeklyProgress.studentTypeName}
            weekDays={data.weeklyGoals.map((g) => ({
              date: new Date(g.date),
              achieved: g.achieved,
            }))}
          />

          {/* 단계 7: 분기 누적 벌점 + 상점 잔액 */}
          {data.penaltyThreshold !== undefined && <ParentPointsCard data={data} />}
        </div>
      ))}

      {/* 자녀 관리 바로가기 */}
      <Link href='/parent/settings'>
        <Card className='mt-4 cursor-pointer p-4 transition-colors hover:bg-gray-50'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100'>
                <Settings className='text-text-muted h-5 w-5' />
              </div>
              <div>
                <p className='text-text font-semibold'>자녀 관리</p>
                <p className='text-text-muted text-sm'>자녀 추가 또는 연결 해제</p>
              </div>
            </div>
            <ChevronRight className='text-text-muted h-5 w-5' />
          </div>
        </Card>
      </Link>
    </div>
  );
}
