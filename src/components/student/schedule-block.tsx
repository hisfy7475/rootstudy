'use client';

import { Clock, Calendar, Repeat, CalendarDays, Trash2, ToggleLeft, ToggleRight, X, Edit } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { StudentAbsenceSchedule } from '@/types/database';
import { DAY_NAMES } from '@/lib/constants';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ScheduleBlockProps {
  schedule: StudentAbsenceSchedule;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (schedule: StudentAbsenceSchedule) => void;
  variant?: 'active' | 'inactive' | 'pending' | 'rejected';
}

export default function ScheduleBlock({
  schedule,
  onToggle,
  onDelete,
  onEdit,
  variant = 'active',
}: ScheduleBlockProps) {
  const formatTimeRange = (start: string, end: string) => {
    return `${start.slice(0, 5)} ~ ${end.slice(0, 5)}`;
  };

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '-';
    return days.map(d => DAY_NAMES[d]).join(', ');
  };

  const isActive = variant === 'active';
  const isPending = variant === 'pending';
  const isInactive = variant === 'inactive';
  const isRejected = variant === 'rejected';

  const getCardStyle = () => {
    if (isRejected) return 'bg-red-50 border-red-200';
    if (isPending) return 'bg-amber-50 border-amber-200';
    if (isInactive) return 'bg-gray-50 opacity-60';
    return '';
  };

  const getIconBgStyle = () => {
    if (isRejected) return 'bg-red-100';
    if (isPending) return 'bg-amber-100';
    if (isInactive) return 'bg-gray-200';
    return schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100';
  };

  const getIconColor = () => {
    if (isRejected) return 'text-red-600';
    if (isPending) return 'text-amber-600';
    if (isInactive) return 'text-gray-400';
    return schedule.is_recurring ? 'text-primary' : 'text-amber-600';
  };

  const getTextColor = () => {
    if (isRejected) return 'text-red-800';
    if (isPending) return 'text-amber-800';
    if (isInactive) return 'text-gray-500';
    return 'text-gray-800';
  };

  const getSubTextColor = () => {
    if (isRejected) return 'text-red-600';
    if (isPending) return 'text-amber-600';
    if (isInactive) return 'text-gray-400';
    return 'text-gray-500';
  };

  return (
    <Card className={`p-4 ${getCardStyle()}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${getIconBgStyle()}`}>
            {schedule.is_recurring ? (
              <Repeat className={`w-5 h-5 ${getIconColor()}`} />
            ) : (
              <CalendarDays className={`w-5 h-5 ${getIconColor()}`} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-medium ${getTextColor()}`}>
                {schedule.title}
              </h3>
              {isPending && (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-200 text-amber-800 rounded-full">
                  승인 대기
                </span>
              )}
              {isRejected && (
                <span className="px-2 py-0.5 text-xs font-medium bg-red-200 text-red-800 rounded-full">
                  거부됨
                </span>
              )}
            </div>
            <div className={`flex items-center gap-2 text-sm mt-1 ${getSubTextColor()}`}>
              <Clock className="w-3.5 h-3.5" />
              <span>{formatTimeRange(schedule.start_time, schedule.end_time)}</span>
            </div>
            {schedule.is_recurring ? (
              <div className={`flex items-center gap-2 text-sm mt-1 ${getSubTextColor()}`}>
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatDaysOfWeek(schedule.day_of_week)}</span>
              </div>
            ) : (
              <div className={`flex items-center gap-2 text-sm mt-1 ${getSubTextColor()}`}>
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  {schedule.specific_date 
                    ? format(new Date(schedule.specific_date), 'M월 d일 (eee)', { locale: ko })
                    : '-'
                  }
                </span>
              </div>
            )}
            {schedule.description && (
              <p className={`text-xs mt-1.5 ${isRejected ? 'text-red-500' : isPending ? 'text-amber-500' : isActive ? 'text-gray-400' : 'text-gray-300'}`}>
                {schedule.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {onEdit && !isPending && !isRejected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(schedule)}
              title="수정"
            >
              <Edit className={`w-4 h-4 ${isActive ? 'text-gray-500' : 'text-gray-400'}`} />
            </Button>
          )}
          {!isPending && !isRejected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggle(schedule.id)}
              title={isActive ? '비활성화' : '활성화'}
            >
              {isActive ? (
                <ToggleRight className="w-5 h-5 text-green-500" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-gray-400" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(schedule.id)}
            className={isRejected ? 'text-red-600' : isPending ? 'text-amber-600' : isActive ? 'text-red-500' : 'text-red-400'}
            title="삭제"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// 일정 상세 모달 컴포넌트
interface ScheduleDetailModalProps {
  schedule: StudentAbsenceSchedule;
  onClose: () => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (schedule: StudentAbsenceSchedule) => void;
}

export function ScheduleDetailModal({
  schedule,
  onClose,
  onToggle,
  onDelete,
  onEdit,
}: ScheduleDetailModalProps) {
  const formatTimeRange = (start: string, end: string) => {
    return `${start.slice(0, 5)} ~ ${end.slice(0, 5)}`;
  };

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '-';
    return days.map(d => DAY_NAMES[d]).join(', ');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-sm p-5 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-gray-800">{schedule.title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-3">
          {/* 시간 정보 */}
          <div className="flex items-center gap-3 text-gray-600">
            <Clock className="w-5 h-5 text-gray-400" />
            <p className="font-medium">{formatTimeRange(schedule.start_time, schedule.end_time)}</p>
          </div>

          {/* 요일/날짜 정보 */}
          <div className="flex items-center gap-3 text-gray-600">
            {schedule.is_recurring ? (
              <>
                <Repeat className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium">매주 반복</p>
                  <p className="text-sm text-gray-500">{formatDaysOfWeek(schedule.day_of_week)}</p>
                </div>
              </>
            ) : (
              <>
                <CalendarDays className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium">일회성</p>
                  <p className="text-sm text-gray-500">
                    {schedule.specific_date 
                      ? format(new Date(schedule.specific_date), 'yyyy년 M월 d일 (eee)', { locale: ko })
                      : '-'
                    }
                  </p>
                </div>
              </>
            )}
          </div>

          {/* 설명 */}
          {schedule.description && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">{schedule.description}</p>
            </div>
          )}

          {/* 상태 */}
          <div className={`p-3 rounded-lg ${schedule.is_active ? 'bg-green-50' : 'bg-gray-100'}`}>
            <p className={`text-sm font-medium ${schedule.is_active ? 'text-green-700' : 'text-gray-500'}`}>
              {schedule.is_active ? '활성화됨' : '비활성화됨'}
            </p>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 mt-5">
          {onEdit && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                onEdit(schedule);
                onClose();
              }}
            >
              <Edit className="w-4 h-4 mr-2" />
              수정
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              onToggle(schedule.id);
              onClose();
            }}
          >
            {schedule.is_active ? (
              <>
                <ToggleLeft className="w-4 h-4 mr-2" />
                비활성화
              </>
            ) : (
              <>
                <ToggleRight className="w-4 h-4 mr-2" />
                활성화
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="text-red-500 border-red-200 hover:bg-red-50"
            onClick={() => {
              if (confirm('이 일정을 삭제하시겠습니까?')) {
                onDelete(schedule.id);
                onClose();
              }
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
