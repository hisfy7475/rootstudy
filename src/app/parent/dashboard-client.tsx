'use client';

import { StudentInfoCard } from '@/components/parent/student-info-card';
import { StudentStatusCard } from '@/components/parent/student-status-card';
import { Card } from '@/components/ui/card';
import { Calendar, ChevronRight, UserX, UserPlus, Settings } from 'lucide-react';
import Link from 'next/link';

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

interface DashboardProps {
  students: StudentData[];
  totalPendingSchedules: number;
}

export function ParentDashboardClient({
  students,
  totalPendingSchedules,
}: DashboardProps) {
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
      {/* 스케줄 승인 바로가기 */}
      <Link href="/parent/schedule">
        <Card className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-secondary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="font-semibold text-text">스케줄 승인</p>
                <p className="text-sm text-text-muted">
                  {totalPendingSchedules > 0 
                    ? `${totalPendingSchedules}개의 승인 대기 중`
                    : '대기 중인 스케줄이 없습니다'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {totalPendingSchedules > 0 && (
                <div className="w-6 h-6 rounded-full bg-secondary text-white text-xs font-bold flex items-center justify-center">
                  {totalPendingSchedules}
                </div>
              )}
              <ChevronRight className="w-5 h-5 text-text-muted" />
            </div>
          </div>
        </Card>
      </Link>

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
