'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAttendanceBoard, getWeeklyAttendance } from '@/lib/actions/admin';
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
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn, getTodayKST, formatDateKST } from '@/lib/utils';

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

interface WeeklyStudent {
  id: string;
  seatNumber: number | null;
  name: string;
  dailyStatus: Record<string, {
    status: 'attended' | 'not_attended' | 'on_break' | null;
    checkInTime: string | null;
  }>;
}

interface Period {
  id: string;
  period_number: number;
  name: string | null;
  start_time: string;
  end_time: string;
}

interface AttendanceClientProps {
  initialData: {
    data: AttendanceStudent[];
    total: number;
    page: number;
    pageSize: number;
  };
  todayPeriods: Period[];
  dateTypeName: string | null;
  todayDate: string;
  branchId: string | null;
}

type ViewMode = 'daily' | 'weekly';

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

// 날짜 포맷팅 (YYYY-MM-DD → M월 D일 (요일))
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = days[date.getDay()];
  return `${month}월 ${day}일 (${dayOfWeek})`;
}

// 간단한 날짜 포맷팅 (M/D (요일))
function formatShortDate(dateStr: string): { date: string; day: string } {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return {
    date: `${month}/${day}`,
    day: days[date.getDay()],
  };
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

// 주의 월요일 날짜 계산 (KST 기준)
function getWeekMonday(date: Date): string {
  // KST 기준 날짜를 구한 뒤 월요일로 이동
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstTime = new Date(date.getTime() + KST_OFFSET_MS);
  const day = kstTime.getUTCDay();
  const diff = kstTime.getUTCDate() - day + (day === 0 ? -6 : 1);
  kstTime.setUTCDate(diff);
  return kstTime.toISOString().split('T')[0];
}

// 주 범위 텍스트 생성
function getWeekRangeText(mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  
  const startMonth = monday.getMonth() + 1;
  const startDay = monday.getDate();
  const endMonth = sunday.getMonth() + 1;
  const endDay = sunday.getDate();
  
  if (startMonth === endMonth) {
    return `${startMonth}월 ${startDay}일 ~ ${endDay}일`;
  }
  return `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일`;
}

export function AttendanceClient({ initialData, todayPeriods, dateTypeName, todayDate, branchId }: AttendanceClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [data, setData] = useState<AttendanceStudent[]>(initialData.data);
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // 페이지네이션 상태 (일별 뷰)
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const [total, setTotal] = useState(initialData.total);
  
  // 주간 뷰 상태
  const [weeklyData, setWeeklyData] = useState<WeeklyStudent[]>([]);
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [currentWeekMonday, setCurrentWeekMonday] = useState(getWeekMonday(new Date()));
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyPage, setWeeklyPage] = useState(1);
  const [weeklyPageSize, setWeeklyPageSize] = useState(20);
  const [weeklyTotal, setWeeklyTotal] = useState(0);

  // 현재 시간 업데이트 (1분마다)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // 30초마다 자동 새로고침 (일별 뷰에서만)
  useEffect(() => {
    if (viewMode !== 'daily') return;
    const interval = setInterval(() => handleRefresh(selectedDate, page, pageSize), 30000);
    return () => clearInterval(interval);
  }, [viewMode, selectedDate, page, pageSize]);

  // 날짜 변경 시 데이터 새로고침
  useEffect(() => {
    if (viewMode === 'daily') {
      handleRefresh(selectedDate, 1, pageSize); // 날짜 변경 시 1페이지로
      setPage(1);
    }
  }, [selectedDate]);

  // 페이지 또는 페이지 사이즈 변경 시 데이터 새로고침
  useEffect(() => {
    if (viewMode === 'daily') {
      handleRefresh(selectedDate, page, pageSize);
    }
  }, [page, pageSize]);

  // 주간 뷰로 전환 시 데이터 로드
  useEffect(() => {
    if (viewMode === 'weekly') {
      loadWeeklyData(currentWeekMonday, weeklyPage, weeklyPageSize);
    }
  }, [viewMode, currentWeekMonday, weeklyPage, weeklyPageSize]);

  const handleRefresh = async (date: string, p: number, ps: number) => {
    setLoading(true);
    try {
      const result = await getAttendanceBoard(date, branchId, p, ps);
      setData(result.data);
      setTotal(result.total);
      setCurrentTime(new Date());
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeeklyData = async (mondayDate: string, p: number, ps: number) => {
    setWeeklyLoading(true);
    try {
      const result = await getWeeklyAttendance(mondayDate, branchId, p, ps);
      setWeeklyData(result.students);
      setWeekDates(result.dates);
      setWeeklyTotal(result.total);
    } catch (error) {
      console.error('Failed to load weekly data:', error);
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handlePreviousWeek = () => {
    const monday = new Date(currentWeekMonday + 'T00:00:00');
    monday.setDate(monday.getDate() - 7);
    setCurrentWeekMonday(formatDateKST(monday));
    setWeeklyPage(1);
  };

  const handleNextWeek = () => {
    const monday = new Date(currentWeekMonday + 'T00:00:00');
    monday.setDate(monday.getDate() + 7);
    setCurrentWeekMonday(formatDateKST(monday));
    setWeeklyPage(1);
  };

  const handleThisWeek = () => {
    setCurrentWeekMonday(getWeekMonday(new Date()));
    setWeeklyPage(1);
  };

  const handlePrint = () => {
    window.print();
  };

  // 페이지 사이즈 변경 핸들러
  const handlePageSizeChange = (newSize: number) => {
    if (viewMode === 'daily') {
      setPageSize(newSize);
      setPage(1);
    } else {
      setWeeklyPageSize(newSize);
      setWeeklyPage(1);
    }
  };

  // 통계 계산
  const stats = {
    total: total,
    checkedIn: data.filter(s => s.status === 'checked_in').length,
    checkedOut: data.filter(s => s.status === 'checked_out').length,
    onBreak: data.filter(s => s.status === 'on_break').length,
    notYetArrived: data.filter(s => s.status === 'checked_out' && !s.firstCheckInTime).length,
  };

  // 오늘인지 확인
  const isToday = selectedDate === todayDate;

  // 페이지네이션 계산
  const currentTotal = viewMode === 'daily' ? total : weeklyTotal;
  const currentPage = viewMode === 'daily' ? page : weeklyPage;
  const currentPageSize = viewMode === 'daily' ? pageSize : weeklyPageSize;
  const totalPages = Math.ceil(currentTotal / currentPageSize);
  const startItem = (currentPage - 1) * currentPageSize + 1;
  const endItem = Math.min(currentPage * currentPageSize, currentTotal);

  // 페이지 변경 핸들러
  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    if (viewMode === 'daily') {
      setPage(newPage);
    } else {
      setWeeklyPage(newPage);
    }
  };

  // 페이지네이션 컴포넌트
  const PaginationControls = () => (
    <div className="flex items-center justify-between px-3 py-2 border-t bg-gray-50 print:hidden">
      {/* 페이지 사이즈 선택 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-600">페이지당</span>
        <select
          value={currentPageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          className="border rounded-md px-1.5 py-0.5 text-xs bg-white"
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>{size}명</option>
          ))}
        </select>
      </div>

      {/* 페이지 정보 및 네비게이션 */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-600">
          총 {currentTotal}명 중 {currentTotal > 0 ? `${startItem}-${endItem}` : '0'}
        </span>
        
        <div className="flex items-center gap-0.5">
          <Button
            variant="outline"
            size="sm"
            className="px-1.5 h-7"
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="px-1.5 h-7"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          
          <span className="px-2 text-xs">
            {currentPage} / {totalPages || 1}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            className="px-1.5 h-7"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="px-1.5 h-7"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage >= totalPages}
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 print:p-2 print:space-y-2">
      {/* 헤더 */}
      <div className="flex items-center justify-between print:mb-2">
        <div>
          <h1 className="text-2xl font-bold print:text-lg">출석부</h1>
          <div className="flex items-center gap-2 mt-1 text-text-muted print:text-sm">
            <Clock className="w-4 h-4" />
            {viewMode === 'daily' ? (
              <>
                <span>{formatDate(selectedDate)}</span>
                {dateTypeName && isToday && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                    {dateTypeName}
                  </span>
                )}
                {isToday && (
                  <span className="print:hidden">
                    (마지막 업데이트: {currentTime.toLocaleTimeString('ko-KR')})
                  </span>
                )}
              </>
            ) : (
              <span>{getWeekRangeText(currentWeekMonday)}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            인쇄
          </Button>
          {viewMode === 'daily' && (
            <Button variant="outline" onClick={() => handleRefresh(selectedDate, page, pageSize)} disabled={loading}>
              <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
              새로고침
            </Button>
          )}
        </div>
      </div>

      {/* 뷰 전환 탭 + 날짜/주 선택 */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        {/* 뷰 전환 탭 */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('daily')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              viewMode === 'daily'
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <List className="w-4 h-4" />
            일별 뷰
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              viewMode === 'weekly'
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <CalendarDays className="w-4 h-4" />
            주간 뷰
          </button>
        </div>

        {/* 날짜/주 선택 */}
        {viewMode === 'daily' ? (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-44"
            />
            {!isToday && (
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(todayDate)}>
                오늘
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="px-2" onClick={handlePreviousWeek}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleThisWeek}>
              이번 주
            </Button>
            <Button variant="outline" size="sm" className="px-2" onClick={handleNextWeek}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {viewMode === 'daily' ? (
        <>
          {/* 통계 카드 - 인쇄 시 간소화 */}
          <div className="grid grid-cols-5 gap-3 print:grid-cols-5 print:gap-1">
            <Card className="p-3 print:p-1.5">
              <div className="text-xs text-gray-500 print:text-[10px]">전체</div>
              <div className="text-xl font-bold print:text-base">{stats.total}</div>
            </Card>
            <Card className="p-3 print:p-1.5 border-green-200 bg-green-50">
              <div className="text-xs text-green-600 print:text-[10px]">입실</div>
              <div className="text-xl font-bold text-green-600 print:text-base">{stats.checkedIn}</div>
            </Card>
            <Card className="p-3 print:p-1.5 border-amber-200 bg-amber-50">
              <div className="text-xs text-amber-600 print:text-[10px]">외출</div>
              <div className="text-xl font-bold text-amber-600 print:text-base">{stats.onBreak}</div>
            </Card>
            <Card className="p-3 print:p-1.5">
              <div className="text-xs text-gray-500 print:text-[10px]">퇴실</div>
              <div className="text-xl font-bold text-gray-400 print:text-base">{stats.checkedOut}</div>
            </Card>
            <Card className="p-3 print:p-1.5 border-red-200 bg-red-50">
              <div className="text-xs text-red-600 print:text-[10px]">미등원</div>
              <div className="text-xl font-bold text-red-600 print:text-base">{stats.notYetArrived}</div>
            </Card>
          </div>

          {/* 일별 출석부 테이블 */}
          <Card className="overflow-hidden print:shadow-none print:border">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b print:bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">번호</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">이름</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">상태</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">입실시간</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">미등원시간</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">부재일정</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">몰입도</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">벌점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-2 py-6 text-center text-xs text-gray-500">
                        로딩 중...
                      </td>
                    </tr>
                  ) : data.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-2 py-6 text-center text-xs text-gray-500">
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
                          <td className="px-2 py-1.5 print:px-1 print:py-0.5">
                            <span className="font-medium text-primary print:text-black">
                              {student.seatNumber || '-'}
                            </span>
                          </td>

                          {/* 이름 */}
                          <td className="px-2 py-1.5 print:px-1 print:py-0.5">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-gray-400 print:hidden" />
                              <span className="font-medium">{student.name}</span>
                            </div>
                          </td>

                          {/* 상태 */}
                          <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium',
                              statusDisplay.bg,
                              statusDisplay.color
                            )}>
                              <StatusIcon className="w-3 h-3" />
                              {statusDisplay.label}
                            </span>
                          </td>

                          {/* 입실시간 */}
                          <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5">
                            <span className={cn(
                              student.firstCheckInTime ? 'text-gray-700' : 'text-gray-400'
                            )}>
                              {formatTime(student.firstCheckInTime)}
                            </span>
                          </td>

                          {/* 미등원 시간 */}
                          <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5">
                            {isNotArrived && isToday ? (
                              <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                {getElapsedTime(currentTime)}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* 부재일정 */}
                          <td className="px-2 py-1.5 print:px-1 print:py-0.5">
                            {student.absenceSchedules.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {student.absenceSchedules.map(schedule => (
                                  <span 
                                    key={schedule.id}
                                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded"
                                  >
                                    <Calendar className="w-2.5 h-2.5" />
                                    {schedule.title} ({schedule.startTime}~{schedule.endTime})
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* 몰입도 */}
                          <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5">
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
                                <span className="text-[10px] text-gray-400">({student.focusCount}회)</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* 벌점 */}
                          <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5">
                            {student.todayPenalty > 0 ? (
                              <span className="font-semibold text-red-600">
                                -{student.todayPenalty}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            
            {/* 페이지네이션 */}
            <PaginationControls />
          </Card>
        </>
      ) : (
        /* 주간 뷰 */
        <Card className="overflow-hidden print:shadow-none print:border">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b print:bg-gray-100">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px] sticky left-0 bg-gray-50 z-10">
                    번호
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px] sticky left-10 bg-gray-50 z-10">
                    이름
                  </th>
                  {weekDates.map((dateStr) => {
                    const { date, day } = formatShortDate(dateStr);
                    const isWeekend = day === '토' || day === '일';
                    const isTodayDate = dateStr === todayDate;
                    return (
                      <th 
                        key={dateStr}
                        className={cn(
                          'px-2 py-2 text-center text-xs font-medium print:px-1 print:py-0.5 print:text-[10px] min-w-[56px]',
                          isWeekend ? 'text-red-500' : 'text-gray-600',
                          isTodayDate && 'bg-primary/10'
                        )}
                      >
                        <div>{date}</div>
                        <div className="text-[10px] font-normal">({day})</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {weeklyLoading ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-6 text-center text-xs text-gray-500">
                      로딩 중...
                    </td>
                  </tr>
                ) : weeklyData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-6 text-center text-xs text-gray-500">
                      등록된 학생이 없습니다.
                    </td>
                  </tr>
                ) : (
                  weeklyData.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                      {/* 번호 */}
                      <td className="px-2 py-1.5 print:px-1 print:py-0.5 sticky left-0 bg-white z-10">
                        <span className="font-medium text-primary print:text-black">
                          {student.seatNumber || '-'}
                        </span>
                      </td>

                      {/* 이름 */}
                      <td className="px-2 py-1.5 print:px-1 print:py-0.5 sticky left-10 bg-white z-10">
                        <span className="font-medium">{student.name}</span>
                      </td>

                      {/* 각 날짜별 출석 상태 */}
                      {weekDates.map((dateStr) => {
                        const dayStatus = student.dailyStatus[dateStr];
                        const isTodayDate = dateStr === todayDate;
                        
                        return (
                          <td 
                            key={dateStr} 
                            className={cn(
                              'px-2 py-1.5 text-center print:px-1 print:py-0.5',
                              isTodayDate && 'bg-primary/5'
                            )}
                          >
                            {dayStatus?.status === null ? (
                              <span className="text-gray-300">-</span>
                            ) : dayStatus?.status === 'attended' ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </span>
                            ) : dayStatus?.status === 'not_attended' ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500">
                                <XCircle className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-500">
                                <Coffee className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* 범례 */}
          <div className="flex items-center gap-4 px-3 py-2 border-t bg-gray-50 print:hidden">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="w-3 h-3" />
              </span>
              <span className="text-gray-600">출석</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-500">
                <XCircle className="w-3 h-3" />
              </span>
              <span className="text-gray-600">결석</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-300">-</span>
              <span className="text-gray-600">미래 날짜</span>
            </div>
          </div>
          
          {/* 페이지네이션 */}
          <PaginationControls />
        </Card>
      )}

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
