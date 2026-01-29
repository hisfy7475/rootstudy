'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Repeat,
  CalendarDays,
  X,
  LayoutGrid,
  List,
  Clock,
  Info
} from 'lucide-react';
import {
  createAbsenceSchedule,
  deleteAbsenceSchedule,
  toggleAbsenceSchedule
} from '@/lib/actions/absence-schedule';
import type { StudentAbsenceSchedule } from '@/types/database';
import { DAY_NAMES, SCHEDULE_DATE_TYPES, ABSENCE_REASONS } from '@/lib/constants';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import ScheduleTimeline from '@/components/student/schedule-timeline';
import ScheduleBlock, { ScheduleDetailModal } from '@/components/student/schedule-block';

interface ScheduleClientProps {
  initialSchedules: StudentAbsenceSchedule[];
}

type ViewMode = 'timeline' | 'list';

export default function ScheduleClient({ initialSchedules }: ScheduleClientProps) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [selectedSchedule, setSelectedSchedule] = useState<StudentAbsenceSchedule | null>(null);

  // 폼 상태
  const [formData, setFormData] = useState({
    reasonType: '' as string, // 선택된 사유 타입
    customReason: '', // 기타 사유 직접 입력
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
      reasonType: '',
      customReason: '',
      description: '',
      isRecurring: true,
      dayOfWeek: [],
      startTime: '09:00',
      endTime: '10:00',
      dateType: 'all',
      specificDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    });
  };

  // 선택된 사유에 따른 제목 생성
  const getTitle = () => {
    if (formData.reasonType === 'other') {
      return formData.customReason.trim();
    }
    const reason = ABSENCE_REASONS.find(r => r.value === formData.reasonType);
    return reason?.label || '';
  };

  const handleDayToggle = (day: number) => {
    if (formData.dayOfWeek.includes(day)) {
      setFormData({ ...formData, dayOfWeek: formData.dayOfWeek.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, dayOfWeek: [...formData.dayOfWeek, day].sort() });
    }
  };

  const handleSubmit = async () => {
    if (!formData.reasonType) {
      alert('부재 사유를 선택해주세요.');
      return;
    }
    if (formData.reasonType === 'other' && !formData.customReason.trim()) {
      alert('기타 사유를 입력해주세요.');
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

    const title = getTitle();
    if (!title) {
      alert('부재 사유를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const result = await createAbsenceSchedule({
      title,
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

  // 타임라인에서 드래그로 시간 선택 시
  const handleTimeSelect = (dayOfWeek: number, startTime: string, endTime: string) => {
    setFormData({
      reasonType: '',
      customReason: '',
      description: '',
      isRecurring: true,
      dayOfWeek: [dayOfWeek],
      startTime,
      endTime,
      dateType: 'all',
      specificDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    });
    setShowAddForm(true);
  };

  // 타임라인에서 일정 블록 클릭 시
  const handleScheduleClick = (schedule: StudentAbsenceSchedule) => {
    setSelectedSchedule(schedule);
  };

  // 승인 대기 vs 승인됨 분류
  const pendingSchedules = schedules.filter(s => s.status === 'pending');
  const approvedSchedules = schedules.filter(s => s.status === 'approved');
  const activeSchedules = approvedSchedules.filter(s => s.is_active);
  const inactiveSchedules = approvedSchedules.filter(s => !s.is_active);

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">부재 일정 관리</h1>
          <p className="text-sm text-gray-500 mt-1">자리를 비우는 일정을 등록하세요</p>
        </div>
        {/* 뷰 모드 토글 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <Button
            variant={viewMode === 'timeline' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('timeline')}
            className="h-8 px-3"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-8 px-3"
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 안내 메시지 */}
      <Card className="p-3 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-blue-700 text-sm">
            새로 등록한 부재 일정은 학부모님 또는 관리자의 승인이 필요합니다.
          </p>
        </div>
      </Card>

      {/* 승인 대기 일정 */}
      {pendingSchedules.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-amber-600">
              승인 대기 ({pendingSchedules.length})
            </h2>
          </div>
          <div className="space-y-3">
            {pendingSchedules.map(schedule => (
              <ScheduleBlock
                key={schedule.id}
                schedule={schedule}
                variant="pending"
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* 타임라인 뷰 */}
      {viewMode === 'timeline' && !showAddForm && (
        <ScheduleTimeline
          schedules={approvedSchedules}
          onTimeSelect={handleTimeSelect}
          onScheduleClick={handleScheduleClick}
        />
      )}

      {/* 추가 버튼 (리스트 뷰일 때 또는 타임라인 뷰에서 폼이 닫혀 있을 때) */}
      {!showAddForm && (
        <Button
          onClick={() => setShowAddForm(true)}
          className="w-full flex items-center justify-center gap-2"
          variant={viewMode === 'timeline' ? 'outline' : 'default'}
        >
          <Plus className="w-4 h-4" />
          새 부재 일정 등록
        </Button>
      )}

      {/* 추가/수정 폼 모달 */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-5 bg-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">새 부재 일정</h3>
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
              {/* 부재 사유 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  부재 사유 *
                </label>
                <div className="space-y-2">
                  {ABSENCE_REASONS.map((reason) => (
                    <label
                      key={reason.value}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        formData.reasonType === reason.value
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="absenceReason"
                        value={reason.value}
                        checked={formData.reasonType === reason.value}
                        onChange={(e) => setFormData({ ...formData, reasonType: e.target.value, customReason: '' })}
                        className="w-4 h-4 text-primary"
                      />
                      <span className="text-sm text-gray-700">{reason.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 기타 사유 입력 (기타 선택 시에만 표시) */}
              {formData.reasonType === 'other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    기타 사유 입력 *
                  </label>
                  <Input
                    value={formData.customReason}
                    onChange={(e) => setFormData({ ...formData, customReason: e.target.value })}
                    placeholder="부재 사유를 입력해주세요"
                  />
                </div>
              )}

              {/* 설명 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  추가 설명 (선택)
                </label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="추가 설명이 필요하면 입력하세요"
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
        </div>
      )}

      {/* 일정 상세 모달 */}
      {selectedSchedule && (
        <ScheduleDetailModal
          schedule={selectedSchedule}
          onClose={() => setSelectedSchedule(null)}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      )}

      {/* 리스트 뷰 */}
      {viewMode === 'list' && (
        <>
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
                  <ScheduleBlock
                    key={schedule.id}
                    schedule={schedule}
                    variant="active"
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
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
                  <ScheduleBlock
                    key={schedule.id}
                    schedule={schedule}
                    variant="inactive"
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 타임라인 뷰에서 비활성 일정 표시 */}
      {viewMode === 'timeline' && inactiveSchedules.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-400 mb-3">
            비활성 일정 ({inactiveSchedules.length})
          </h2>
          <div className="space-y-3">
            {inactiveSchedules.map(schedule => (
              <ScheduleBlock
                key={schedule.id}
                schedule={schedule}
                variant="inactive"
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
