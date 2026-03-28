'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { AttendanceStat } from '@/lib/actions/report';

export interface AttendanceCardProps {
  attendanceStat: AttendanceStat;
}

function AttendanceCircle({ rate }: { rate: number }) {
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (rate / 100) * circumference;

  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="#f97316"
        strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="44" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#111827">
        {rate}%
      </text>
      <text x="48" y="58" textAnchor="middle" fontSize="9" fill="#6b7280">
        출석률
      </text>
    </svg>
  );
}

export function AttendanceCard({ attendanceStat }: AttendanceCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-1.5 rounded-full bg-primary" />
          <h3 className="text-lg font-semibold leading-none tracking-tight text-text">
            출결 관리
          </h3>
          <span className="ml-auto text-xs text-text-muted">일 기준 출결 비율</span>
        </div>
      </CardHeader>
      <CardContent>
        {attendanceStat.totalWeekdays === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">
            아직 집계할 출석 데이터가 없습니다.
          </p>
        ) : (
          <div className="flex items-center gap-6">
            <AttendanceCircle rate={attendanceStat.attendanceRate} />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">결석</span>
                <span className="text-sm font-semibold text-red-500">
                  {attendanceStat.absentRate}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">정상 출석</span>
                <span className="text-sm font-semibold text-orange-500">
                  {attendanceStat.attendanceRate}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-text-muted">
                <span>
                  출석 {attendanceStat.attendedDays}일 / {attendanceStat.totalWeekdays}일
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
