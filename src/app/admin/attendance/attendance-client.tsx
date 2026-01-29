'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAttendanceBoard } from '@/lib/actions/admin';
import {
  RefreshCw,
  Printer,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  Coffee,
  Calendar,
  AlertTriangle,
  Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AbsenceSchedule {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
}

interface AttendanceStudent {
  id: string;
  seatNumber: number | null;
  name: string;
  status: 'checked_in' | 'checked_out' | 'on_break';
  firstCheckInTime: string | null;
  lastCheckOutTime: string | null;
  absenceSchedules: AbsenceSchedule[];
  avgFocus: number | null;
  todayPenalty: number;
  focusCount: number;
}

interface Period {
  id: string;
  period_number: number;
  name: string | null;
  start_time: string;
  end_time: string;
}

interface AttendanceClientProps {
  initialData: AttendanceStudent[];
  todayPeriods: Period[];
  dateTypeName: string | null;
  todayDate: string;
}

// 날짜 포맷팅 (YYYY-MM-DD → M월 D일 (요일))
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = days[date.getDay()];
  return `${month}월 ${day}일 (${dayOfWeek})`;
}

// 시간 포맷팅 (ISO → HH:mm)
function formatTime(isoString: string | null): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// 미등원 경과 시간 계산
function getElapsedTime(now: Date): string {
  // 오늘의 기준 시작 시간 (예: 08:00)
  const todayStart = new Date(now);
  todayStart.setHours(8, 0, 0, 0);
  
  if (now < todayStart) return '-';
  
  const elapsedMs = now.getTime() - todayStart.getTime();
  const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

// 상태 아이콘 및 색상
function getStatusDisplay(status: string) {
  switch (status) {
    case 'checked_in':
      return { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100', label: '입실' };
    case 'checked_out':
      return { icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-100', label: '퇴실' };
    case 'on_break':
      return { icon: Coffee, color: 'text-amber-500', bg: 'bg-amber-100', label: '외출' };
    default:
      return { icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-100', label: '-' };
  }
}

export function AttendanceClient({ initialData, todayPeriods, dateTypeName, todayDate }: AttendanceClientProps) {
  const [data, setData] = useState<AttendanceStudent[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // 현재 시간 업데이트 (1분마다)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // 30초마다 자동 새로고침
  useEffect(() => {
    const interval = setInterval(handleRefresh, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const newData = await getAttendanceBoard();
      setData(newData);
      setCurrentTime(new Date());
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // 통계 계산
  const stats = {
    total: data.length,
    checkedIn: data.filter(s => s.status === 'checked_in').length,
    checkedOut: data.filter(s => s.status === 'checked_out').length,
    onBreak: data.filter(s => s.status === 'on_break').length,
    notYetArrived: data.filter(s => s.status === 'checked_out' && !s.firstCheckInTime).length,
  };

  return (
    <div className="p-6 space-y-6 print:p-2 print:space-y-2">
      {/* 헤더 - 인쇄 시 간소화 */}
      <div className="flex items-center justify-between print:mb-2">
        <div>
          <h1 className="text-2xl font-bold print:text-lg">출석부</h1>
          <div className="flex items-center gap-2 mt-1 text-text-muted print:text-sm">
            <Clock className="w-4 h-4" />
            <span>{formatDate(todayDate)}</span>
            {dateTypeName && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                {dateTypeName}
              </span>
            )}
            <span className="print:hidden">
              (마지막 업데이트: {currentTime.toLocaleTimeString('ko-KR')})
            </span>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            인쇄
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 통계 카드 - 인쇄 시 간소화 */}
      <div className="grid grid-cols-5 gap-4 print:grid-cols-5 print:gap-2">
        <Card className="p-4 print:p-2">
          <div className="text-sm text-gray-500 print:text-xs">전체</div>
          <div className="text-2xl font-bold print:text-lg">{stats.total}</div>
        </Card>
        <Card className="p-4 print:p-2 border-green-200 bg-green-50">
          <div className="text-sm text-green-600 print:text-xs">입실</div>
          <div className="text-2xl font-bold text-green-600 print:text-lg">{stats.checkedIn}</div>
        </Card>
        <Card className="p-4 print:p-2 border-amber-200 bg-amber-50">
          <div className="text-sm text-amber-600 print:text-xs">외출</div>
          <div className="text-2xl font-bold text-amber-600 print:text-lg">{stats.onBreak}</div>
        </Card>
        <Card className="p-4 print:p-2">
          <div className="text-sm text-gray-500 print:text-xs">퇴실</div>
          <div className="text-2xl font-bold text-gray-400 print:text-lg">{stats.checkedOut}</div>
        </Card>
        <Card className="p-4 print:p-2 border-red-200 bg-red-50">
          <div className="text-sm text-red-600 print:text-xs">미등원</div>
          <div className="text-2xl font-bold text-red-600 print:text-lg">{stats.notYetArrived}</div>
        </Card>
      </div>

      {/* 출석부 테이블 */}
      <Card className="overflow-hidden print:shadow-none print:border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b print:bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 print:px-2 print:py-1 print:text-xs">번호</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 print:px-2 print:py-1 print:text-xs">이름</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 print:px-2 print:py-1 print:text-xs">상태</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 print:px-2 print:py-1 print:text-xs">입실시간</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 print:px-2 print:py-1 print:text-xs">미등원시간</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 print:px-2 print:py-1 print:text-xs">부재일정</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 print:px-2 print:py-1 print:text-xs">몰입도</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 print:px-2 print:py-1 print:text-xs">벌점</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    등록된 학생이 없습니다.
                  </td>
                </tr>
              ) : (
                data.map((student) => {
                  const statusDisplay = getStatusDisplay(student.status);
                  const StatusIcon = statusDisplay.icon;
                  const isNotArrived = student.status === 'checked_out' && !student.firstCheckInTime;

                  return (
                    <tr 
                      key={student.id} 
                      className={cn(
                        'hover:bg-gray-50 print:hover:bg-transparent',
                        isNotArrived && 'bg-red-50/50'
                      )}
                    >
                      {/* 번호 */}
                      <td className="px-4 py-3 print:px-2 print:py-1">
                        <span className="font-medium text-primary print:text-black">
                          {student.seatNumber || '-'}
                        </span>
                      </td>

                      {/* 이름 */}
                      <td className="px-4 py-3 print:px-2 print:py-1">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400 print:hidden" />
                          <span className="font-medium">{student.name}</span>
                        </div>
                      </td>

                      {/* 상태 */}
                      <td className="px-4 py-3 text-center print:px-2 print:py-1">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                          statusDisplay.bg,
                          statusDisplay.color
                        )}>
                          <StatusIcon className="w-3 h-3" />
                          {statusDisplay.label}
                        </span>
                      </td>

                      {/* 입실시간 */}
                      <td className="px-4 py-3 text-center print:px-2 print:py-1">
                        <span className={cn(
                          'text-sm',
                          student.firstCheckInTime ? 'text-gray-700' : 'text-gray-400'
                        )}>
                          {formatTime(student.firstCheckInTime)}
                        </span>
                      </td>

                      {/* 미등원 시간 */}
                      <td className="px-4 py-3 text-center print:px-2 print:py-1">
                        {isNotArrived ? (
                          <span className="inline-flex items-center gap-1 text-sm text-red-600 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            {getElapsedTime(currentTime)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>

                      {/* 부재일정 */}
                      <td className="px-4 py-3 print:px-2 print:py-1">
                        {student.absenceSchedules.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {student.absenceSchedules.map(schedule => (
                              <span 
                                key={schedule.id}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded"
                              >
                                <Calendar className="w-3 h-3" />
                                {schedule.title} ({schedule.startTime}~{schedule.endTime})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>

                      {/* 몰입도 */}
                      <td className="px-4 py-3 text-center print:px-2 print:py-1">
                        {student.avgFocus !== null ? (
                          <div className="flex flex-col items-center">
                            <span className={cn(
                              'font-semibold',
                              student.avgFocus >= 8 ? 'text-green-600' :
                              student.avgFocus >= 6 ? 'text-primary' :
                              student.avgFocus >= 4 ? 'text-amber-600' : 'text-red-500'
                            )}>
                              {student.avgFocus}
                            </span>
                            <span className="text-xs text-gray-400">({student.focusCount}회)</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>

                      {/* 벌점 */}
                      <td className="px-4 py-3 text-center print:px-2 print:py-1">
                        {student.todayPenalty > 0 ? (
                          <span className="font-semibold text-red-600">
                            -{student.todayPenalty}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 인쇄용 푸터 */}
      <div className="hidden print:block text-center text-xs text-gray-400 mt-4">
        출력일시: {new Date().toLocaleString('ko-KR')}
      </div>

      {/* 인쇄 스타일 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* 사이드바 등 불필요한 요소 숨김 */
          nav, aside, header > div:last-child {
            display: none !important;
          }

          /* 본문만 표시 */
          main {
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
