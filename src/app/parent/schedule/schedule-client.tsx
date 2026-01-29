'use client';

import { useState } from 'react';
import { ScheduleList } from '@/components/parent/schedule-list';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Clock, Calendar, Repeat, CalendarDays, Info } from 'lucide-react';
import { DAY_NAMES, ABSENCE_BUFFER_MINUTES } from '@/lib/constants';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { StudentAbsenceSchedule } from '@/types/database';

interface Schedule {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  studentName?: string;
}

interface AbsenceScheduleWithStudent extends StudentAbsenceSchedule {
  studentName: string;
}

interface ScheduleClientProps {
  pendingSchedules: Schedule[];
  approvedSchedules: Schedule[];
  rejectedSchedules: Schedule[];
  absenceSchedules: AbsenceScheduleWithStudent[];
}

type TabType = 'absence' | 'pending' | 'approved' | 'rejected';

const tabs: { id: TabType; label: string }[] = [
  { id: 'absence', label: '부재 일정' },
  { id: 'pending', label: '승인 대기' },
  { id: 'approved', label: '승인됨' },
  { id: 'rejected', label: '거부됨' },
];

export function ScheduleClient({
  pendingSchedules,
  approvedSchedules,
  rejectedSchedules,
  absenceSchedules,
}: ScheduleClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('absence');

  const getSchedules = () => {
    switch (activeTab) {
      case 'pending':
        return pendingSchedules;
      case 'approved':
        return approvedSchedules;
      case 'rejected':
        return rejectedSchedules;
      default:
        return [];
    }
  };

  const getCounts = () => ({
    absence: absenceSchedules.filter(s => s.is_active).length,
    pending: pendingSchedules.length,
    approved: approvedSchedules.length,
    rejected: rejectedSchedules.length,
  });

  const counts = getCounts();

  const formatTimeRange = (start: string, end: string) => {
    return `${start.slice(0, 5)} ~ ${end.slice(0, 5)}`;
  };

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '매일';
    return days.map(d => DAY_NAMES[d]).join(', ');
  };

  const activeAbsenceSchedules = absenceSchedules.filter(s => s.is_active);
  const inactiveAbsenceSchedules = absenceSchedules.filter(s => !s.is_active);

  return (
    <div className="p-4 space-y-4">
      {/* 탭 네비게이션 */}
      <div className="flex bg-gray-100 rounded-2xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 py-2.5 px-2 rounded-xl text-sm font-medium transition-all',
              'flex items-center justify-center gap-1',
              activeTab === tab.id
                ? 'bg-white text-text shadow-sm'
                : 'text-text-muted hover:text-text'
            )}
          >
            <span className="truncate">{tab.label}</span>
            {counts[tab.id] > 0 && (
              <span className={cn(
                'min-w-[18px] h-[18px] px-1 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0',
                activeTab === tab.id
                  ? tab.id === 'pending' 
                    ? 'bg-secondary text-white' 
                    : tab.id === 'absence'
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-text-muted'
                  : 'bg-gray-200 text-text-muted'
              )}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 부재 일정 탭 */}
      {activeTab === 'absence' && (
        <div className="space-y-4">
          {/* 안내 */}
          <Card className="p-3 bg-blue-50 border-blue-200">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-blue-700 text-sm">
                자녀가 등록한 부재 일정입니다. 앞뒤 {ABSENCE_BUFFER_MINUTES}분 버퍼가 적용되어 알림/벌점이 면제됩니다.
              </p>
            </div>
          </Card>

          {/* 활성 부재 일정 */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">
              활성 일정 ({activeAbsenceSchedules.length})
            </h3>
            {activeAbsenceSchedules.length === 0 ? (
              <Card className="p-6 text-center text-gray-500 text-sm">
                등록된 부재 일정이 없습니다
              </Card>
            ) : (
              <div className="space-y-3">
                {activeAbsenceSchedules.map(schedule => (
                  <Card key={schedule.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100'
                        }`}>
                          {schedule.is_recurring ? (
                            <Repeat className="w-5 h-5 text-primary" />
                          ) : (
                            <CalendarDays className="w-5 h-5 text-amber-600" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-800">{schedule.title}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">{schedule.studentName}</p>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-sm">
                            {formatTimeRange(schedule.start_time, schedule.end_time)}
                          </span>
                        </div>
                        {schedule.is_recurring ? (
                          <div className="flex items-center gap-1.5 text-gray-500 mt-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="text-xs">{formatDaysOfWeek(schedule.day_of_week)}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-gray-500 mt-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="text-xs">
                              {schedule.specific_date 
                                ? format(new Date(schedule.specific_date), 'M월 d일', { locale: ko })
                                : '-'
                              }
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* 비활성 부재 일정 */}
          {inactiveAbsenceSchedules.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-400 mb-3 text-sm">
                비활성 일정 ({inactiveAbsenceSchedules.length})
              </h3>
              <div className="space-y-2">
                {inactiveAbsenceSchedules.map(schedule => (
                  <Card key={schedule.id} className="p-3 bg-gray-50 opacity-60">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-500 text-sm">{schedule.title}</h4>
                        <p className="text-xs text-gray-400">{schedule.studentName}</p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatTimeRange(schedule.start_time, schedule.end_time)}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 승인 스케줄 목록 */}
      {activeTab !== 'absence' && (
        <ScheduleList 
          schedules={getSchedules()} 
          showActions={activeTab === 'pending'}
        />
      )}
    </div>
  );
}
