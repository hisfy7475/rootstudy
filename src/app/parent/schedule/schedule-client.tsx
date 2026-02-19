'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Clock, 
  Calendar, 
  Repeat, 
  CalendarDays, 
  Info, 
  Plus,
  Check,
  X,
  User,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import { DAY_NAMES, ABSENCE_BUFFER_MINUTES } from '@/lib/constants';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { StudentAbsenceSchedule } from '@/types/database';
import type { LinkedStudent } from '@/lib/actions/parent';
import { 
  createAbsenceScheduleForChild, 
  approveAbsenceSchedule, 
  rejectAbsenceSchedule,
  updateAbsenceSchedule,
  deleteAbsenceSchedule,
} from '@/lib/actions/absence-schedule';

interface AbsenceScheduleWithStudent extends StudentAbsenceSchedule {
  studentName: string;
  studentId: string;
}

interface PendingScheduleWithStudent extends StudentAbsenceSchedule {
  student_name: string;
}

interface ScheduleClientProps {
  linkedStudents: LinkedStudent[];
  absenceSchedules: AbsenceScheduleWithStudent[];
  pendingSchedules: PendingScheduleWithStudent[];
}

type TabType = 'absence' | 'pending' | 'create';

const tabs: { id: TabType; label: string }[] = [
  { id: 'absence', label: '부재 일정' },
  { id: 'pending', label: '승인 대기' },
  { id: 'create', label: '새 일정' },
];

export function ScheduleClient({
  linkedStudents,
  absenceSchedules,
  pendingSchedules,
}: ScheduleClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('absence');
  const [isPending, startTransition] = useTransition();

  // 새 일정 폼 상태
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    linkedStudents[0]?.id || ''
  );
  const [title, setTitle] = useState('');
  const [isRecurring, setIsRecurring] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [specificDate, setSpecificDate] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // 수정 모달 상태
  const [editingSchedule, setEditingSchedule] = useState<AbsenceScheduleWithStudent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editIsRecurring, setEditIsRecurring] = useState(true);
  const [editSelectedDays, setEditSelectedDays] = useState<number[]>([]);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editSpecificDate, setEditSpecificDate] = useState('');
  const [editError, setEditError] = useState('');
  const [isEditLoading, setIsEditLoading] = useState(false);

  const getCounts = () => ({
    absence: absenceSchedules.filter(s => s.status === 'approved' && s.is_active).length,
    pending: pendingSchedules.length,
    create: 0,
  });

  const counts = getCounts();

  const formatTimeRange = (start: string, end: string) => {
    return `${start.slice(0, 5)} ~ ${end.slice(0, 5)}`;
  };

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '매일';
    return days.map(d => DAY_NAMES[d]).join(', ');
  };

  // 승인된 활성 부재 일정만 필터링
  const approvedActiveSchedules = absenceSchedules.filter(
    s => s.status === 'approved' && s.is_active
  );
  const approvedInactiveSchedules = absenceSchedules.filter(
    s => s.status === 'approved' && !s.is_active
  );

  const openEditModal = (schedule: AbsenceScheduleWithStudent) => {
    setEditingSchedule(schedule);
    setEditTitle(schedule.title);
    setEditIsRecurring(schedule.is_recurring);
    setEditSelectedDays(schedule.day_of_week || []);
    setEditStartTime(schedule.start_time.slice(0, 5));
    setEditEndTime(schedule.end_time.slice(0, 5));
    setEditSpecificDate(schedule.specific_date || '');
    setEditError('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    setEditError('');

    if (!editTitle.trim()) {
      setEditError('일정 제목을 입력해주세요.');
      return;
    }
    if (editIsRecurring && editSelectedDays.length === 0) {
      setEditError('반복 요일을 선택해주세요.');
      return;
    }
    if (!editIsRecurring && !editSpecificDate) {
      setEditError('날짜를 선택해주세요.');
      return;
    }
    if (!editStartTime || !editEndTime) {
      setEditError('시작 시간과 종료 시간을 입력해주세요.');
      return;
    }

    setIsEditLoading(true);
    const result = await updateAbsenceSchedule(editingSchedule.id, {
      title: editTitle.trim(),
      is_recurring: editIsRecurring,
      recurrence_type: editIsRecurring ? 'weekly' : 'one_time',
      day_of_week: editIsRecurring ? editSelectedDays : null,
      start_time: editStartTime + ':00',
      end_time: editEndTime + ':00',
      specific_date: !editIsRecurring ? editSpecificDate : null,
    });

    if (result.success) {
      setEditingSchedule(null);
    } else {
      setEditError(result.error || '수정에 실패했습니다.');
    }
    setIsEditLoading(false);
  };

  const handleDelete = async (schedule: AbsenceScheduleWithStudent) => {
    if (!confirm(`"${schedule.title}" 일정을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;

    startTransition(async () => {
      const result = await deleteAbsenceSchedule(schedule.id);
      if (!result.success) {
        alert(result.error || '삭제에 실패했습니다.');
      }
    });
  };

  const toggleEditDay = (day: number) => {
    setEditSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const handleApprove = async (scheduleId: string) => {
    startTransition(async () => {
      const result = await approveAbsenceSchedule(scheduleId);
      if (!result.success) {
        alert(result.error || '승인에 실패했습니다.');
      }
    });
  };

  const handleReject = async (scheduleId: string) => {
    if (!confirm('이 부재 일정 요청을 거부하시겠습니까?')) return;
    
    startTransition(async () => {
      const result = await rejectAbsenceSchedule(scheduleId);
      if (!result.success) {
        alert(result.error || '거부에 실패했습니다.');
      }
    });
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!selectedStudentId) {
      setFormError('자녀를 선택해주세요.');
      return;
    }
    if (!title.trim()) {
      setFormError('일정 제목을 입력해주세요.');
      return;
    }
    if (!startTime || !endTime) {
      setFormError('시작 시간과 종료 시간을 입력해주세요.');
      return;
    }
    if (isRecurring && selectedDays.length === 0) {
      setFormError('반복 요일을 선택해주세요.');
      return;
    }
    if (!isRecurring && !specificDate) {
      setFormError('날짜를 선택해주세요.');
      return;
    }

    startTransition(async () => {
      const result = await createAbsenceScheduleForChild(selectedStudentId, {
        title: title.trim(),
        is_recurring: isRecurring,
        recurrence_type: isRecurring ? 'weekly' : 'one_time',
        day_of_week: isRecurring ? selectedDays : undefined,
        start_time: startTime,
        end_time: endTime,
        specific_date: !isRecurring ? specificDate : undefined,
      });

      if (result.success) {
        setFormSuccess('부재 일정이 등록되었습니다.');
        // 폼 초기화
        setTitle('');
        setSelectedDays([]);
        setStartTime('');
        setEndTime('');
        setSpecificDate('');
        // 부재 일정 탭으로 이동
        setTimeout(() => {
          setActiveTab('absence');
          setFormSuccess('');
        }, 1500);
      } else {
        setFormError(result.error || '일정 등록에 실패했습니다.');
      }
    });
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

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
            {tab.id !== 'create' && counts[tab.id] > 0 && (
              <span className={cn(
                'min-w-[18px] h-[18px] px-1 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0',
                activeTab === tab.id
                  ? tab.id === 'pending' 
                    ? 'bg-secondary text-white' 
                    : 'bg-primary text-white'
                  : 'bg-gray-200 text-text-muted'
              )}>
                {counts[tab.id]}
              </span>
            )}
            {tab.id === 'create' && (
              <Plus className="w-4 h-4" />
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
                승인된 부재 일정입니다. 앞뒤 {ABSENCE_BUFFER_MINUTES}분 버퍼가 적용되어 알림/벌점이 면제됩니다.
              </p>
            </div>
          </Card>

          {/* 활성 부재 일정 */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">
              활성 일정 ({approvedActiveSchedules.length})
            </h3>
            {approvedActiveSchedules.length === 0 ? (
              <Card className="p-6 text-center text-gray-500 text-sm">
                승인된 부재 일정이 없습니다
              </Card>
            ) : (
              <div className="space-y-3">
                {approvedActiveSchedules.map(schedule => (
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
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => openEditModal(schedule)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(schedule)}
                            disabled={isPending}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* 비활성 부재 일정 */}
          {approvedInactiveSchedules.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-400 mb-3 text-sm">
                비활성 일정 ({approvedInactiveSchedules.length})
              </h3>
              <div className="space-y-2">
                {approvedInactiveSchedules.map(schedule => (
                  <Card key={schedule.id} className="p-3 bg-gray-50 opacity-60">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-500 text-sm">{schedule.title}</h4>
                        <p className="text-xs text-gray-400">{schedule.studentName}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(schedule)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(schedule)}
                          disabled={isPending}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs text-gray-400 ml-1">
                          {formatTimeRange(schedule.start_time, schedule.end_time)}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 승인 대기 탭 */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <Card className="p-3 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-amber-700 text-sm">
                자녀가 등록한 부재 일정입니다. 승인하면 해당 시간에 알림/벌점이 면제됩니다.
              </p>
            </div>
          </Card>

          {pendingSchedules.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">승인 대기 중인 일정이 없습니다</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingSchedules.map(schedule => (
                <Card key={schedule.id} className="p-4 border-amber-200 bg-amber-50/30">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          schedule.is_recurring ? 'bg-amber-100' : 'bg-amber-100'
                        }`}>
                          {schedule.is_recurring ? (
                            <Repeat className="w-5 h-5 text-amber-600" />
                          ) : (
                            <CalendarDays className="w-5 h-5 text-amber-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-800">{schedule.title}</h4>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                              승인 대기
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                            <User className="w-3 h-3" />
                            <span>{schedule.student_name}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600 pl-13">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatTimeRange(schedule.start_time, schedule.end_time)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {schedule.is_recurring 
                            ? formatDaysOfWeek(schedule.day_of_week)
                            : schedule.specific_date 
                              ? format(new Date(schedule.specific_date), 'M월 d일', { locale: ko })
                              : '-'
                          }
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => handleReject(schedule.id)}
                        variant="outline"
                        size="sm"
                        className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={isPending}
                      >
                        <X className="w-4 h-4 mr-1" />
                        거부
                      </Button>
                      <Button
                        onClick={() => handleApprove(schedule.id)}
                        size="sm"
                        className="flex-1 bg-primary hover:bg-primary/90"
                        disabled={isPending}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        승인
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 수정 모달 */}
      {editingSchedule && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="w-full max-w-lg bg-white rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto pb-28">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">부재 일정 수정</h3>
              <button
                onClick={() => setEditingSchedule(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 pb-8">
              {/* 제목 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  일정 제목
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="예: 학원, 병원 방문"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              {/* 반복 유형 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  일정 유형
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditIsRecurring(true)}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
                      editIsRecurring
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    <Repeat className="w-4 h-4" />
                    반복 일정
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsRecurring(false)}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2',
                      !editIsRecurring
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    <CalendarDays className="w-4 h-4" />
                    일회성
                  </button>
                </div>
              </div>

              {/* 반복 요일 */}
              {editIsRecurring && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    반복 요일
                  </label>
                  <div className="flex gap-2">
                    {DAY_NAMES.map((dayName, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => toggleEditDay(index)}
                        className={cn(
                          'w-10 h-10 rounded-full text-sm font-medium transition-all',
                          editSelectedDays.includes(index)
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
                      >
                        {dayName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 일회성 날짜 */}
              {!editIsRecurring && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    날짜
                  </label>
                  <input
                    type="date"
                    value={editSpecificDate}
                    onChange={(e) => setEditSpecificDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              )}

              {/* 시간 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  부재 시간
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <span className="text-gray-500">~</span>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {editError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isEditLoading}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isEditLoading ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 새 일정 등록 탭 */}
      {activeTab === 'create' && (
        <div className="space-y-4">
          <Card className="p-3 bg-green-50 border-green-200">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <p className="text-green-700 text-sm">
                학부모가 직접 등록한 부재 일정은 바로 승인됩니다.
              </p>
            </div>
          </Card>

          {linkedStudents.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">
              <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">연결된 자녀가 없습니다</p>
            </Card>
          ) : (
            <form onSubmit={handleCreateSchedule} className="space-y-4 pb-8">
              {/* 자녀 선택 */}
              <Card className="p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  자녀 선택
                </label>
                <div className="flex gap-2 flex-wrap">
                  {linkedStudents.map(student => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                        selectedStudentId === student.id
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      )}
                    >
                      {student.name}
                    </button>
                  ))}
                </div>
              </Card>

              {/* 제목 */}
              <Card className="p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  일정 제목
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 학원, 병원 방문"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </Card>

              {/* 반복 유형 */}
              <Card className="p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  일정 유형
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRecurring(true)}
                    className={cn(
                      'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                      isRecurring
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    <Repeat className="w-4 h-4" />
                    반복 일정
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRecurring(false)}
                    className={cn(
                      'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                      !isRecurring
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                  >
                    <CalendarDays className="w-4 h-4" />
                    일회성
                  </button>
                </div>
              </Card>

              {/* 반복 요일 선택 */}
              {isRecurring && (
                <Card className="p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    반복 요일
                  </label>
                  <div className="flex gap-2">
                    {DAY_NAMES.map((dayName, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => toggleDay(index)}
                        className={cn(
                          'w-10 h-10 rounded-full text-sm font-medium transition-all',
                          selectedDays.includes(index)
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
                      >
                        {dayName}
                      </button>
                    ))}
                  </div>
                </Card>
              )}

              {/* 일회성 날짜 선택 */}
              {!isRecurring && (
                <Card className="p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    날짜
                  </label>
                  <input
                    type="date"
                    value={specificDate}
                    onChange={(e) => setSpecificDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </Card>
              )}

              {/* 시간 */}
              <Card className="p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  부재 시간
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <span className="text-gray-500">~</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </Card>

              {/* 에러/성공 메시지 */}
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  {formSuccess}
                </div>
              )}

              {/* 제출 버튼 */}
              <Button
                type="submit"
                className="w-full py-3 bg-primary hover:bg-primary/90"
                disabled={isPending}
              >
                {isPending ? '등록 중...' : '부재 일정 등록'}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
