'use client';

import { useTransition } from 'react';
import { StudentInfoCard } from '@/components/parent/student-info-card';
import { StudentStatusCard } from '@/components/parent/student-status-card';
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

type AttendanceStatus = 'checked_in' | 'checked_out' | 'on_break';

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  seatNumber: number | null;
}

interface StudentData {
  student: Student;
  status: AttendanceStatus;
  lastUpdate: string | null;
  studyTime: number;
  currentSubject: string | null;
  todayFocus: number | null;
  pendingSchedules: number;
}

interface PendingScheduleWithStudent extends StudentAbsenceSchedule {
  student_name: string;
}

interface DashboardProps {
  students: StudentData[];
  pendingSchedules: PendingScheduleWithStudent[];
}

export function ParentDashboardClient({
  students,
  pendingSchedules,
}: DashboardProps) {
  const [isPending, startTransition] = useTransition();

  const formatTimeRange = (start: string, end: string) => {
    return `${start.slice(0, 5)} ~ ${end.slice(0, 5)}`;
  };

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '매일';
    return days.map(d => DAY_NAMES[d]).join(', ');
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

  // 연결된 자녀가 없는 경우
  if (students.length === 0) {
    return (
      <div className="p-4">
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <UserX className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-lg font-bold text-text mb-2">
              연결된 자녀가 없습니다
            </h2>
            <p className="text-sm text-text-muted mb-4">
              설정에서 자녀의 연결 코드를 입력하여
              <br />
              자녀와 연결해주세요.
            </p>
            <Link href="/parent/settings">
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors">
                <UserPlus className="w-4 h-4" />
                <span>자녀 연결하기</span>
              </button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 승인 대기 스케줄 */}
      {pendingSchedules.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-gray-800">승인 대기 중인 부재 일정</h2>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
              {pendingSchedules.length}건
            </span>
          </div>
          <div className="space-y-2">
            {pendingSchedules.map(schedule => (
              <div
                key={schedule.id}
                className="p-3 bg-white rounded-xl border border-amber-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100'
                    }`}>
                      {schedule.is_recurring ? (
                        <Repeat className="w-4 h-4 text-primary" />
                      ) : (
                        <CalendarDays className="w-4 h-4 text-amber-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 text-sm truncate">{schedule.title}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-0.5">
                          <User className="w-3 h-3" />
                          {schedule.student_name}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {formatTimeRange(schedule.start_time, schedule.end_time)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Calendar className="w-3 h-3" />
                          {schedule.is_recurring 
                            ? formatDaysOfWeek(schedule.day_of_week)
                            : schedule.specific_date 
                              ? format(new Date(schedule.specific_date), 'M/d', { locale: ko })
                              : '-'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReject(schedule.id)}
                      disabled={isPending}
                      className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(schedule.id)}
                      disabled={isPending}
                      className="h-8 px-2 bg-primary hover:bg-primary/90"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link href="/parent/schedule" className="block mt-3">
            <div className="flex items-center justify-center gap-1 text-sm text-amber-700 hover:text-amber-800">
              <span>전체 일정 관리</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </Link>
        </Card>
      )}

      {/* 자녀별 카드 */}
      {students.map((data, index) => (
        <div key={data.student.id} className="space-y-3">
          {/* 자녀 구분 헤더 (여러 자녀일 때만) */}
          {students.length > 1 && (
            <div className="flex items-center gap-2 pt-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">{index + 1}</span>
              </div>
              <span className="text-sm font-medium text-text-muted">
                {data.student.name}
              </span>
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
            lastUpdate={data.lastUpdate}
          />
        </div>
      ))}

      {/* 자녀 관리 바로가기 */}
      <Link href="/parent/settings">
        <Card className="p-4 hover:bg-gray-50 transition-colors cursor-pointer mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center">
                <Settings className="w-5 h-5 text-text-muted" />
              </div>
              <div>
                <p className="font-semibold text-text">자녀 관리</p>
                <p className="text-sm text-text-muted">
                  자녀 추가 또는 연결 해제
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-text-muted" />
          </div>
        </Card>
      </Link>
    </div>
  );
}
