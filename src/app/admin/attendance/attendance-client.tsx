'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  Search,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn, formatDateKST, getStudyDate } from '@/lib/utils';

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
  weeklyStudyMinutes: number;
  totalPenalty: number;
  totalReward: number;
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
    stats: { checkedIn: number; checkedOut: number; onBreak: number; notYetArrived: number };
  };
  todayPeriods: Period[];
  dateTypeName: string | null;
  todayDate: string;
  branchId: string | null;
}

type ViewMode = 'daily' | 'weekly';

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

type StatusFilter = 'checked_in' | 'checked_out' | 'on_break' | 'not_arrived' | null;

function getCurrentStudyDateStr(): string {
  const sd = getStudyDate();
  return formatDateKST(sd);
}

export function AttendanceClient({ initialData, todayPeriods, dateTypeName, todayDate, branchId }: AttendanceClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [data, setData] = useState<AttendanceStudent[]>(initialData.data);
  const [dynamicToday, setDynamicToday] = useState(todayDate);
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [total, setTotal] = useState(initialData.total);
  const [globalStats, setGlobalStats] = useState(initialData.stats);

  // 주간 뷰 상태
  const [weeklyData, setWeeklyData] = useState<WeeklyStudent[]>([]);
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [currentWeekMonday, setCurrentWeekMonday] = useState(getWeekMonday(new Date()));
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  // 주간 뷰 정렬 상태
  type WeeklySortKey = 'seatNumber' | 'name' | 'weeklyStudyMinutes' | 'totalPenalty' | 'totalReward';
  const [weeklySortKey, setWeeklySortKey] = useState<WeeklySortKey>('seatNumber');
  const [weeklySortAsc, setWeeklySortAsc] = useState(true);

  // 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // 상태 필터
  const [activeFilter, setActiveFilter] = useState<StatusFilter>(null);

  const skipInitialDailyListRef = useRef(true);
  const prevViewModeRef = useRef<ViewMode>(viewMode);

  // 주간 뷰 정렬된 데이터
  const sortedWeeklyData = useMemo(() => {
    const sorted = [...weeklyData].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (weeklySortKey) {
        case 'seatNumber':
          aVal = a.seatNumber ?? 9999;
          bVal = b.seatNumber ?? 9999;
          break;
        case 'name':
          aVal = a.name;
          bVal = b.name;
          break;
        case 'weeklyStudyMinutes':
          aVal = a.weeklyStudyMinutes;
          bVal = b.weeklyStudyMinutes;
          break;
        case 'totalPenalty':
          aVal = a.totalPenalty;
          bVal = b.totalPenalty;
          break;
        case 'totalReward':
          aVal = a.totalReward;
          bVal = b.totalReward;
          break;
        default:
          aVal = a.seatNumber ?? 9999;
          bVal = b.seatNumber ?? 9999;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return weeklySortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return weeklySortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [weeklyData, weeklySortKey, weeklySortAsc]);

  const handleWeeklySort = useCallback((key: WeeklySortKey) => {
    setWeeklySortKey(prev => {
      if (prev === key) {
        setWeeklySortAsc(asc => !asc);
        return prev;
      }
      setWeeklySortAsc(true);
      return key;
    });
  }, []);

  // 학습일 변경 감지 (06:00 KST 전후로 날짜가 바뀌는 경우)
  useEffect(() => {
    const checkStudyDateChange = () => {
      const newToday = getCurrentStudyDateStr();
      if (newToday !== dynamicToday) {
        const wasViewingOldToday = selectedDate === dynamicToday;
        setDynamicToday(newToday);
        if (wasViewingOldToday) {
          setSelectedDate(newToday);
        }
      }
    };

    checkStudyDateChange();
    const timer = setInterval(checkStudyDateChange, 30000);
    return () => clearInterval(timer);
  }, [dynamicToday, selectedDate]);

  // 현재 시간 업데이트 (1분마다)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // 검색어 디바운스 (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 일별: 날짜·검색 변경 및 주간→일별 전환 시 전체 재조회 (최초 마운트는 SSR 데이터 사용)
  useEffect(() => {
    if (viewMode !== 'daily') {
      prevViewModeRef.current = viewMode;
      return;
    }

    const fromWeekly = prevViewModeRef.current === 'weekly';
    prevViewModeRef.current = 'daily';

    if (fromWeekly) {
      setData([]);
      handleRefresh(selectedDate, debouncedSearch, activeFilter);
      return;
    }

    if (skipInitialDailyListRef.current) {
      skipInitialDailyListRef.current = false;
      return;
    }

    setData([]);
    handleRefresh(selectedDate, debouncedSearch, activeFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedDate, debouncedSearch]);

  // 일별 출석부는 자동 갱신하지 않음 (Realtime/주기/탭 포커스 시 목록이 줄어들며 스크롤이 튀는 문제 방지).
  // 최신 데이터는 상단 「새로고침」, 날짜·필터·검색 변경 시에만 반영된다.

  // 브라우저 탭이 다시 포커스될 때 학습일 변경 감지
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const newToday = getCurrentStudyDateStr();
        if (newToday !== dynamicToday) {
          const wasViewingOldToday = selectedDate === dynamicToday;
          setDynamicToday(newToday);
          if (wasViewingOldToday) {
            setSelectedDate(newToday);
            return;
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [dynamicToday, selectedDate]);

  // 주간 뷰 데이터
  useEffect(() => {
    if (viewMode !== 'weekly') return;
    loadWeeklyData(currentWeekMonday, debouncedSearch);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, currentWeekMonday, debouncedSearch]);

  // 상태 필터 클릭 핸들러
  const handleFilterClick = (filter: StatusFilter) => {
    const newFilter = activeFilter === filter ? null : filter;
    setActiveFilter(newFilter);
    setData([]);
    handleRefresh(selectedDate, debouncedSearch, newFilter);
  };

  const handleRefresh = async (
    date: string,
    search = debouncedSearch,
    filter: StatusFilter = activeFilter
  ) => {
    setLoading(true);
    try {
      const result = await getAttendanceBoard(date, branchId, search || undefined, filter ?? undefined);
      setData(result.data);
      setTotal(result.total);
      setGlobalStats(result.stats);
      setCurrentTime(new Date());
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeeklyData = async (mondayDate: string, search = debouncedSearch) => {
    setWeeklyLoading(true);
    try {
      const result = await getWeeklyAttendance(mondayDate, branchId, search || undefined);
      setWeeklyData(result.students);
      setWeekDates(result.dates);
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
  };

  const handleNextWeek = () => {
    const monday = new Date(currentWeekMonday + 'T00:00:00');
    monday.setDate(monday.getDate() + 7);
    setCurrentWeekMonday(formatDateKST(monday));
  };

  const handleThisWeek = () => {
    setCurrentWeekMonday(getWeekMonday(new Date()));
  };

  const handlePrint = () => {
    window.print();
  };

  // 통계: 모두 서버 전체 기준
  const stats = {
    total,
    checkedIn: globalStats.checkedIn,
    checkedOut: globalStats.checkedOut,
    onBreak: globalStats.onBreak,
    notYetArrived: globalStats.notYetArrived,
  };

  // 오늘인지 확인
  const isToday = selectedDate === dynamicToday;

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
            <Button
              variant="outline"
              onClick={() => {
                const newToday = getCurrentStudyDateStr();
                let dateToRefresh = selectedDate;
                if (newToday !== dynamicToday) {
                  const wasViewingOldToday = selectedDate === dynamicToday;
                  setDynamicToday(newToday);
                  if (wasViewingOldToday) {
                    dateToRefresh = newToday;
                    setSelectedDate(newToday);
                  }
                }
                handleRefresh(dateToRefresh);
              }}
              disabled={loading}
            >
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

        {/* 학생 이름 검색 */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            type="text"
            placeholder="학생 이름 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
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
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 whitespace-nowrap"
                onClick={() => setSelectedDate(dynamicToday)}
              >
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
          {/* 통계 카드 - 클릭 시 필터 */}
          <div className="grid grid-cols-5 gap-3 print:grid-cols-5 print:gap-1">
            {/* 전체 - 필터 해제 */}
            <button
              onClick={() => { if (activeFilter) handleFilterClick(null); }}
              className={cn(
                'text-left rounded-lg border p-3 print:p-1.5 transition-all',
                activeFilter === null
                  ? 'bg-white border-gray-300 shadow-md ring-2 ring-gray-400'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm opacity-70'
              )}
            >
              <div className="text-xs text-gray-500 print:text-[10px]">전체</div>
              <div className="text-xl font-bold print:text-base">{stats.total}</div>
            </button>
            {/* 입실 */}
            <button
              onClick={() => handleFilterClick('checked_in')}
              className={cn(
                'text-left rounded-lg border p-3 print:p-1.5 transition-all',
                activeFilter === 'checked_in'
                  ? 'bg-green-100 border-green-400 shadow-md ring-2 ring-green-400'
                  : 'bg-green-50 border-green-200 hover:border-green-300 hover:shadow-sm',
                activeFilter !== null && activeFilter !== 'checked_in' && 'opacity-50'
              )}
            >
              <div className="text-xs text-green-600 print:text-[10px]">입실</div>
              <div className="text-xl font-bold text-green-600 print:text-base">{stats.checkedIn}</div>
            </button>
            {/* 외출 */}
            <button
              onClick={() => handleFilterClick('on_break')}
              className={cn(
                'text-left rounded-lg border p-3 print:p-1.5 transition-all',
                activeFilter === 'on_break'
                  ? 'bg-amber-100 border-amber-400 shadow-md ring-2 ring-amber-400'
                  : 'bg-amber-50 border-amber-200 hover:border-amber-300 hover:shadow-sm',
                activeFilter !== null && activeFilter !== 'on_break' && 'opacity-50'
              )}
            >
              <div className="text-xs text-amber-600 print:text-[10px]">외출</div>
              <div className="text-xl font-bold text-amber-600 print:text-base">{stats.onBreak}</div>
            </button>
            {/* 퇴실 */}
            <button
              onClick={() => handleFilterClick('checked_out')}
              className={cn(
                'text-left rounded-lg border p-3 print:p-1.5 transition-all',
                activeFilter === 'checked_out'
                  ? 'bg-gray-200 border-gray-400 shadow-md ring-2 ring-gray-400'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm',
                activeFilter !== null && activeFilter !== 'checked_out' && 'opacity-50'
              )}
            >
              <div className="text-xs text-gray-500 print:text-[10px]">퇴실</div>
              <div className="text-xl font-bold text-gray-400 print:text-base">{stats.checkedOut}</div>
            </button>
            {/* 미등원 */}
            <button
              onClick={() => handleFilterClick('not_arrived')}
              className={cn(
                'text-left rounded-lg border p-3 print:p-1.5 transition-all',
                activeFilter === 'not_arrived'
                  ? 'bg-red-100 border-red-400 shadow-md ring-2 ring-red-400'
                  : 'bg-red-50 border-red-200 hover:border-red-300 hover:shadow-sm',
                activeFilter !== null && activeFilter !== 'not_arrived' && 'opacity-50'
              )}
            >
              <div className="text-xs text-red-600 print:text-[10px]">미등원</div>
              <div className="text-xl font-bold text-red-600 print:text-base">{stats.notYetArrived}</div>
            </button>
          </div>
          {/* 필터 활성 안내 */}
          {activeFilter && (
            <div className="flex items-center gap-2 text-xs text-gray-500 print:hidden -mt-2">
              <span>
                {{
                  checked_in: '입실',
                  on_break: '외출',
                  checked_out: '퇴실',
                  not_arrived: '미등원',
                }[activeFilter]} 학생만 표시 중
              </span>
              <button
                onClick={() => handleFilterClick(null)}
                className="text-primary underline hover:no-underline"
              >
                필터 해제
              </button>
            </div>
          )}

          {/* 일별 출석부 테이블 */}
          <Card className="relative overflow-hidden print:shadow-none print:border">
            {loading && (
              <div
                role="status"
                aria-live="polite"
                aria-busy="true"
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm print:hidden"
              >
                <RefreshCw className="h-10 w-10 animate-spin text-primary" />
                <p className="text-base font-semibold text-gray-800">출석부 불러오는 중…</p>
                <p className="text-xs text-gray-500">전체 명단을 한 번에 가져오고 있습니다</p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b print:bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">번호</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">이름</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">상태</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">입실시간</th>
                    <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">부재일정</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">몰입도</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px]">벌점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && data.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-16 text-center">
                        <div className="flex flex-col items-center justify-center gap-3 text-gray-600">
                          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                          <span className="text-sm font-medium">목록을 불러오는 중입니다…</span>
                        </div>
                      </td>
                    </tr>
                  ) : data.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-6 text-center text-xs text-gray-500">
                        {debouncedSearch ? `"${debouncedSearch}" 검색 결과가 없습니다.` : '등록된 학생이 없습니다.'}
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
          </Card>
        </>
      ) : (
        /* 주간 뷰 */
        <Card className="overflow-hidden print:shadow-none print:border">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b print:bg-gray-100">
                <tr>
                  {/* 번호 헤더 (정렬 가능) */}
                  <th
                    className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px] sticky left-0 bg-gray-50 z-10 cursor-pointer select-none print:cursor-auto"
                    onClick={() => handleWeeklySort('seatNumber')}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      번호
                      <span className="print:hidden">
                        {weeklySortKey === 'seatNumber' ? (
                          weeklySortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-gray-300" />
                        )}
                      </span>
                    </span>
                  </th>
                  {/* 이름 헤더 (정렬 가능) */}
                  <th
                    className="px-2 py-2 text-left text-xs font-medium text-gray-600 print:px-1 print:py-0.5 print:text-[10px] sticky left-10 bg-gray-50 z-10 cursor-pointer select-none print:cursor-auto"
                    onClick={() => handleWeeklySort('name')}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      이름
                      <span className="print:hidden">
                        {weeklySortKey === 'name' ? (
                          weeklySortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-gray-300" />
                        )}
                      </span>
                    </span>
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
                  {/* 주간 학습 헤더 (정렬 가능) */}
                  <th
                    className="px-2 py-2 text-center text-xs font-medium text-blue-600 print:px-1 print:py-0.5 print:text-[10px] min-w-[64px] border-l border-gray-200 cursor-pointer select-none print:cursor-auto"
                    onClick={() => handleWeeklySort('weeklyStudyMinutes')}
                  >
                    <span className="inline-flex items-center justify-center gap-0.5">
                      주간 학습
                      <span className="print:hidden">
                        {weeklySortKey === 'weeklyStudyMinutes' ? (
                          weeklySortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-blue-300" />
                        )}
                      </span>
                    </span>
                  </th>
                  {/* 누적 상점 헤더 (정렬 가능) */}
                  <th
                    className="px-2 py-2 text-center text-xs font-medium text-emerald-600 print:px-1 print:py-0.5 print:text-[10px] min-w-[56px] cursor-pointer select-none print:cursor-auto"
                    onClick={() => handleWeeklySort('totalReward')}
                  >
                    <span className="inline-flex items-center justify-center gap-0.5">
                      누적 상점
                      <span className="print:hidden">
                        {weeklySortKey === 'totalReward' ? (
                          weeklySortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-emerald-300" />
                        )}
                      </span>
                    </span>
                  </th>
                  {/* 누적 벌점 헤더 (정렬 가능) */}
                  <th
                    className="px-2 py-2 text-center text-xs font-medium text-red-500 print:px-1 print:py-0.5 print:text-[10px] min-w-[56px] cursor-pointer select-none print:cursor-auto"
                    onClick={() => handleWeeklySort('totalPenalty')}
                  >
                    <span className="inline-flex items-center justify-center gap-0.5">
                      누적 벌점
                      <span className="print:hidden">
                        {weeklySortKey === 'totalPenalty' ? (
                          weeklySortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-red-300" />
                        )}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {weeklyLoading ? (
                  <tr>
                    <td colSpan={11} className="px-2 py-6 text-center text-xs text-gray-500">
                      로딩 중...
                    </td>
                  </tr>
                ) : weeklyData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-2 py-6 text-center text-xs text-gray-500">
                      {debouncedSearch ? `"${debouncedSearch}" 검색 결과가 없습니다.` : '등록된 학생이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  sortedWeeklyData.map((student) => (
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

                      {/* 주간 학습시간 */}
                      <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5 border-l border-gray-100">
                        {student.weeklyStudyMinutes > 0 ? (
                          <span className="text-blue-600 font-medium">
                            {Math.floor(student.weeklyStudyMinutes / 60)}h {student.weeklyStudyMinutes % 60}m
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      {/* 누적 상점 */}
                      <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5">
                        {student.totalReward > 0 ? (
                          <span className="font-semibold text-emerald-600">
                            +{student.totalReward}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      {/* 누적 벌점 */}
                      <td className="px-2 py-1.5 text-center print:px-1 print:py-0.5">
                        {student.totalPenalty > 0 ? (
                          <span className="font-semibold text-red-600">
                            -{student.totalPenalty}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
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
