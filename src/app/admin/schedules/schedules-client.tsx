'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Calendar,
  Clock,
  User,
  Search,
  Filter,
  RefreshCw,
  Repeat,
  CalendarDays,
  Info
} from 'lucide-react';
import type { StudentAbsenceSchedule } from '@/types/database';
import { DAY_NAMES, ABSENCE_BUFFER_MINUTES } from '@/lib/constants';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ScheduleWithStudent extends StudentAbsenceSchedule {
  student_name?: string;
}

interface SchedulesClientProps {
  initialSchedules: ScheduleWithStudent[];
}

export default function SchedulesClient({ initialSchedules }: SchedulesClientProps) {
  const [schedules] = useState(initialSchedules);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'recurring' | 'one_time'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // 필터링된 스케줄
  const filteredSchedules = useMemo(() => {
    return schedules.filter(schedule => {
      // 검색어 필터
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        if (
          !schedule.student_name?.toLowerCase().includes(searchLower) &&
          !schedule.title.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      // 타입 필터
      if (filterType === 'recurring' && !schedule.is_recurring) return false;
      if (filterType === 'one_time' && schedule.is_recurring) return false;

      // 활성 상태 필터
      if (filterActive === 'active' && !schedule.is_active) return false;
      if (filterActive === 'inactive' && schedule.is_active) return false;

      return true;
    });
  }, [schedules, searchTerm, filterType, filterActive]);

  // 통계
  const stats = useMemo(() => {
    const active = schedules.filter(s => s.is_active).length;
    const recurring = schedules.filter(s => s.is_recurring).length;
    const oneTime = schedules.filter(s => !s.is_recurring).length;
    const uniqueStudents = new Set(schedules.map(s => s.student_id)).size;

    return { active, recurring, oneTime, uniqueStudents, total: schedules.length };
  }, [schedules]);

  // 요일 표시
  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '매일';
    if (days.length === 7) return '매일';
    return days.map(d => DAY_NAMES[d]).join(', ');
  };

  // 시간 범위 표시
  const formatTimeRange = (start: string, end: string) => {
    const startTime = start.slice(0, 5);
    const endTime = end.slice(0, 5);
    return `${startTime} ~ ${endTime}`;
  };

  // 면제 시간 표시 (버퍼 포함)
  const formatExemptionRange = (start: string, end: string, buffer: number) => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    const exemptStartH = startH - Math.floor(buffer / 60);
    const exemptStartM = startM - (buffer % 60);
    const exemptEndH = endH + Math.floor(buffer / 60);
    const exemptEndM = endM + (buffer % 60);
    
    const formatTime = (h: number, m: number) => {
      let hours = h;
      let mins = m;
      if (mins < 0) { hours--; mins += 60; }
      if (mins >= 60) { hours++; mins -= 60; }
      if (hours < 0) hours += 24;
      if (hours >= 24) hours -= 24;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    return `${formatTime(exemptStartH, exemptStartM)} ~ ${formatTime(exemptEndH, exemptEndM)}`;
  };

  // 날짜 타입 표시
  const formatDateType = (dateType: string | null) => {
    switch (dateType) {
      case 'semester': return '학기중';
      case 'vacation': return '방학';
      case 'all': return '항상';
      default: return '항상';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">부재 스케줄 관리</h1>
          <p className="text-gray-500 mt-1">학생들의 부재 일정을 확인합니다. (읽기 전용)</p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </Button>
      </div>

      {/* 버퍼 시간 안내 */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <p className="text-blue-800 font-medium">면제 시간 버퍼 안내</p>
            <p className="text-blue-600 text-sm mt-1">
              등록된 부재 시간 앞뒤로 {ABSENCE_BUFFER_MINUTES}분씩 버퍼가 적용됩니다. 
              버퍼 시간을 포함한 전체 구간 동안 알림과 벌점이 면제됩니다.
            </p>
          </div>
        </div>
      </Card>

      {/* 통계 */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500">전체 스케줄</div>
          <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">활성 스케줄</div>
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">반복 일정</div>
          <div className="text-2xl font-bold text-primary">{stats.recurring}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">일회성 일정</div>
          <div className="text-2xl font-bold text-amber-500">{stats.oneTime}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">등록 학생 수</div>
          <div className="text-2xl font-bold text-gray-800">{stats.uniqueStudents}</div>
        </Card>
      </div>

      {/* 필터 */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="학생 이름 또는 일정 제목 검색"
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="h-10 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">모든 유형</option>
              <option value="recurring">반복 일정</option>
              <option value="one_time">일회성 일정</option>
            </select>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as any)}
              className="h-10 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">모든 상태</option>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
            </select>
          </div>
        </div>
      </Card>

      {/* 스케줄 목록 */}
      <div className="space-y-3">
        {filteredSchedules.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">
            {searchTerm || filterType !== 'all' || filterActive !== 'all'
              ? '검색 결과가 없습니다.'
              : '등록된 부재 스케줄이 없습니다.'
            }
          </Card>
        ) : (
          filteredSchedules.map(schedule => (
            <Card 
              key={schedule.id} 
              className={`p-4 ${!schedule.is_active ? 'opacity-50 bg-gray-50' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100'
                  }`}>
                    {schedule.is_recurring ? (
                      <Repeat className="w-6 h-6 text-primary" />
                    ) : (
                      <CalendarDays className="w-6 h-6 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-800">{schedule.title}</h3>
                      {!schedule.is_active && (
                        <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                          비활성
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <User className="w-4 h-4" />
                      <span>{schedule.student_name}</span>
                    </div>
                    {schedule.description && (
                      <p className="text-sm text-gray-500 mt-1">{schedule.description}</p>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span className="font-medium">
                      {formatTimeRange(schedule.start_time, schedule.end_time)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    면제: {formatExemptionRange(
                      schedule.start_time, 
                      schedule.end_time, 
                      schedule.buffer_minutes
                    )}
                  </div>
                  {schedule.is_recurring ? (
                    <div className="flex items-center gap-2 text-gray-500 mt-2">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDaysOfWeek(schedule.day_of_week)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-500 mt-2">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {schedule.specific_date 
                          ? format(new Date(schedule.specific_date), 'yyyy년 M월 d일 (eee)', { locale: ko })
                          : '-'
                        }
                      </span>
                    </div>
                  )}
                  <div className="mt-1">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                      schedule.date_type === 'semester' 
                        ? 'bg-blue-100 text-blue-700'
                        : schedule.date_type === 'vacation'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {formatDateType(schedule.date_type)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
