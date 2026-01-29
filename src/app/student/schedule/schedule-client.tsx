'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Calendar,
  Clock,
  Repeat,
  CalendarDays,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Info,
  AlertCircle
} from 'lucide-react';
import {
  createAbsenceSchedule,
  updateAbsenceSchedule,
  deleteAbsenceSchedule,
  toggleAbsenceSchedule
} from '@/lib/actions/absence-schedule';
import type { StudentAbsenceSchedule } from '@/types/database';
import { DAY_NAMES, ABSENCE_BUFFER_MINUTES, SCHEDULE_DATE_TYPES } from '@/lib/constants';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ScheduleClientProps {
  initialSchedules: StudentAbsenceSchedule[];
}

export default function ScheduleClient({ initialSchedules }: ScheduleClientProps) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 폼 상태
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    isRecurring: true,
    dayOfWeek: [] as number[],
    startTime: '09:00',
    endTime: '10:00',
    dateType: 'all' as 'semester' | 'vacation' | 'all',
    specificDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      isRecurring: true,
      dayOfWeek: [],
      startTime: '09:00',
      endTime: '10:00',
      dateType: 'all',
      specificDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    });
  };

  const handleDayToggle = (day: number) => {
    if (formData.dayOfWeek.includes(day)) {
      setFormData({ ...formData, dayOfWeek: formData.dayOfWeek.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, dayOfWeek: [...formData.dayOfWeek, day].sort() });
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      alert('일정 제목을 입력해주세요.');
      return;
    }
    if (formData.isRecurring && formData.dayOfWeek.length === 0) {
      alert('반복 요일을 선택해주세요.');
      return;
    }
    if (formData.startTime >= formData.endTime) {
      alert('종료 시간은 시작 시간 이후여야 합니다.');
      return;
    }

    setIsLoading(true);
    const result = await createAbsenceSchedule({
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      is_recurring: formData.isRecurring,
      recurrence_type: formData.isRecurring ? 'weekly' : 'one_time',
      day_of_week: formData.isRecurring ? formData.dayOfWeek : undefined,
      start_time: formData.startTime + ':00',
      end_time: formData.endTime + ':00',
      date_type: formData.dateType,
      specific_date: !formData.isRecurring ? formData.specificDate : undefined,
    });

    if (result.success && result.data) {
      setSchedules([result.data, ...schedules]);
      setShowAddForm(false);
      resetForm();
    } else {
      alert(result.error || '일정 등록에 실패했습니다.');
    }
    setIsLoading(false);
  };

  const handleToggle = async (id: string) => {
    setIsLoading(true);
    const result = await toggleAbsenceSchedule(id);
    if (result.success) {
      setSchedules(schedules.map(s => 
        s.id === id ? { ...s, is_active: !s.is_active } : s
      ));
    }
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    
    setIsLoading(true);
    const result = await deleteAbsenceSchedule(id);
    if (result.success) {
      setSchedules(schedules.filter(s => s.id !== id));
    }
    setIsLoading(false);
  };

  // 면제 시간 계산
  const getExemptionTime = (startTime: string, endTime: string) => {
    const buffer = ABSENCE_BUFFER_MINUTES;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    let exemptStartH = startH;
    let exemptStartM = startM - buffer;
    if (exemptStartM < 0) { exemptStartH--; exemptStartM += 60; }
    if (exemptStartH < 0) exemptStartH += 24;
    
    let exemptEndH = endH;
    let exemptEndM = endM + buffer;
    if (exemptEndM >= 60) { exemptEndH++; exemptEndM -= 60; }
    if (exemptEndH >= 24) exemptEndH -= 24;
    
    return {
      start: `${exemptStartH.toString().padStart(2, '0')}:${exemptStartM.toString().padStart(2, '0')}`,
      end: `${exemptEndH.toString().padStart(2, '0')}:${exemptEndM.toString().padStart(2, '0')}`,
    };
  };

  const formatTimeRange = (start: string, end: string) => {
    return `${start.slice(0, 5)} ~ ${end.slice(0, 5)}`;
  };

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '-';
    return days.map(d => DAY_NAMES[d]).join(', ');
  };

  const activeSchedules = schedules.filter(s => s.is_active);
  const inactiveSchedules = schedules.filter(s => !s.is_active);

  return (
    <div className="p-4 pb-24 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold text-gray-800">부재 일정 관리</h1>
        <p className="text-sm text-gray-500 mt-1">자리를 비우는 일정을 등록하세요</p>
      </div>

      {/* 버퍼 시간 안내 */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-blue-800 font-medium text-sm">자동 면제 시간</p>
            <p className="text-blue-600 text-xs mt-1">
              등록한 부재 시간 앞뒤로 {ABSENCE_BUFFER_MINUTES}분씩 여유 시간이 적용됩니다. 
              이 시간 동안은 알림과 벌점이 자동으로 면제됩니다.
            </p>
          </div>
        </div>
      </Card>

      {/* 추가 버튼 */}
      {!showAddForm && (
        <Button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          새 부재 일정 등록
        </Button>
      )}

      {/* 추가 폼 */}
      {showAddForm && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">새 부재 일정</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-4">
            {/* 제목 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                일정 제목 *
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="예: 학원 수업"
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                설명 (선택)
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="추가 설명"
              />
            </div>

            {/* 반복 여부 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                일정 유형
              </label>
              <div className="flex gap-2">
                <Button
                  variant={formData.isRecurring ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, isRecurring: true })}
                  className="flex-1"
                >
                  <Repeat className="w-4 h-4 mr-2" />
                  매주 반복
                </Button>
                <Button
                  variant={!formData.isRecurring ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, isRecurring: false })}
                  className="flex-1"
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  일회성
                </Button>
              </div>
            </div>

            {/* 반복 요일 선택 */}
            {formData.isRecurring && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  반복 요일 *
                </label>
                <div className="flex gap-1">
                  {DAY_NAMES.map((day, index) => (
                    <Button
                      key={index}
                      variant={formData.dayOfWeek.includes(index) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleDayToggle(index)}
                      className="flex-1 px-0"
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* 일회성 날짜 선택 */}
            {!formData.isRecurring && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  날짜 *
                </label>
                <Input
                  type="date"
                  value={formData.specificDate}
                  onChange={(e) => setFormData({ ...formData, specificDate: e.target.value })}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
            )}

            {/* 시간 설정 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  시작 시간 *
                </label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  종료 시간 *
                </label>
                <Input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>

            {/* 면제 시간 미리보기 */}
            {formData.startTime && formData.endTime && formData.startTime < formData.endTime && (
              <div className="p-3 bg-green-50 rounded-xl">
                <div className="flex items-center gap-2 text-green-700 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    실제 면제 시간: {getExemptionTime(formData.startTime, formData.endTime).start} ~ {getExemptionTime(formData.startTime, formData.endTime).end}
                  </span>
                </div>
              </div>
            )}

            {/* 날짜 타입 */}
            {formData.isRecurring && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  적용 기간
                </label>
                <div className="flex gap-2">
                  {Object.entries(SCHEDULE_DATE_TYPES).map(([key, value]) => (
                    <Button
                      key={key}
                      variant={formData.dateType === value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormData({ ...formData, dateType: value as any })}
                      className="flex-1"
                    >
                      {value === 'semester' ? '학기중' : value === 'vacation' ? '방학' : '항상'}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* 저장 버튼 */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
              >
                취소
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={isLoading}
              >
                등록
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 활성 일정 목록 */}
      <div>
        <h2 className="font-semibold text-gray-800 mb-3">
          활성 일정 ({activeSchedules.length})
        </h2>
        <div className="space-y-3">
          {activeSchedules.length === 0 ? (
            <Card className="p-6 text-center text-gray-500 text-sm">
              등록된 부재 일정이 없습니다
            </Card>
          ) : (
            activeSchedules.map(schedule => (
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
                      <h3 className="font-medium text-gray-800">{schedule.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatTimeRange(schedule.start_time, schedule.end_time)}</span>
                      </div>
                      {schedule.is_recurring ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDaysOfWeek(schedule.day_of_week)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            {schedule.specific_date 
                              ? format(new Date(schedule.specific_date), 'M월 d일 (eee)', { locale: ko })
                              : '-'
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(schedule.id)}
                      title="비활성화"
                    >
                      <ToggleRight className="w-5 h-5 text-green-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(schedule.id)}
                      className="text-red-500"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* 비활성 일정 */}
      {inactiveSchedules.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-400 mb-3">
            비활성 일정 ({inactiveSchedules.length})
          </h2>
          <div className="space-y-3">
            {inactiveSchedules.map(schedule => (
              <Card key={schedule.id} className="p-4 bg-gray-50 opacity-60">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0">
                      {schedule.is_recurring ? (
                        <Repeat className="w-5 h-5 text-gray-400" />
                      ) : (
                        <CalendarDays className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-500">{schedule.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatTimeRange(schedule.start_time, schedule.end_time)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(schedule.id)}
                      title="활성화"
                    >
                      <ToggleLeft className="w-5 h-5 text-gray-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(schedule.id)}
                      className="text-red-400"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
