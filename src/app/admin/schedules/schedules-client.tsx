'use client';

import { useState, useMemo, useTransition } from 'react';
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
  Info,
  Plus,
  X,
  Check,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { StudentAbsenceSchedule } from '@/types/database';
import { DAY_NAMES, ABSENCE_BUFFER_MINUTES, SCHEDULE_DATE_TYPES } from '@/lib/constants';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { 
  createAbsenceScheduleForStudent, 
  getAllAbsenceSchedules,
  approveAbsenceSchedule,
  rejectAbsenceSchedule,
  updateAbsenceSchedule,
  deleteAbsenceSchedule,
} from '@/lib/actions/absence-schedule';
import { cn } from '@/lib/utils';

interface ScheduleWithStudent extends StudentAbsenceSchedule {
  student_name?: string;
}

interface PendingScheduleWithStudent extends StudentAbsenceSchedule {
  student_name: string;
}

interface StudentInfo {
  id: string;
  name: string;
  seatNumber: number | null;
}

interface SchedulesClientProps {
  initialSchedules: ScheduleWithStudent[];
  pendingSchedules: PendingScheduleWithStudent[];
  students: StudentInfo[];
}

export default function SchedulesClient({ initialSchedules, pendingSchedules: initialPending, students }: SchedulesClientProps) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [pendingList, setPendingList] = useState(initialPending);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'recurring' | 'one_time'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'pending'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 폼 상태
  const [formData, setFormData] = useState({
    studentId: '',
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
      studentId: '',
      title: '',
      description: '',
      isRecurring: true,
      dayOfWeek: [],
      startTime: '09:00',
      endTime: '10:00',
      dateType: 'all',
      specificDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    });
    setEditingScheduleId(null);
  };

  const openEditModal = (schedule: ScheduleWithStudent) => {
    setFormData({
      studentId: schedule.student_id,
      title: schedule.title,
      description: schedule.description || '',
      isRecurring: schedule.is_recurring,
      dayOfWeek: schedule.day_of_week || [],
      startTime: schedule.start_time.slice(0, 5),
      endTime: schedule.end_time.slice(0, 5),
      dateType: (schedule.date_type as 'semester' | 'vacation' | 'all') || 'all',
      specificDate: schedule.specific_date || format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    });
    setEditingScheduleId(schedule.id);
    setShowAddModal(true);
  };

  const handleDayToggle = (day: number) => {
    if (formData.dayOfWeek.includes(day)) {
      setFormData({ ...formData, dayOfWeek: formData.dayOfWeek.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, dayOfWeek: [...formData.dayOfWeek, day].sort() });
    }
  };

  const handleSubmit = async () => {
    if (!editingScheduleId && !formData.studentId) {
      alert('학생을 선택해주세요.');
      return;
    }
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

    if (editingScheduleId) {
      const result = await updateAbsenceSchedule(editingScheduleId, {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        is_recurring: formData.isRecurring,
        recurrence_type: formData.isRecurring ? 'weekly' : 'one_time',
        day_of_week: formData.isRecurring ? formData.dayOfWeek : null,
        start_time: formData.startTime + ':00',
        end_time: formData.endTime + ':00',
        date_type: formData.dateType,
        specific_date: !formData.isRecurring ? formData.specificDate : null,
      });

      if (result.success) {
        const newSchedules = await getAllAbsenceSchedules();
        setSchedules(newSchedules);
        setShowAddModal(false);
        resetForm();
      } else {
        alert(result.error || '일정 수정에 실패했습니다.');
      }
    } else {
      const result = await createAbsenceScheduleForStudent(formData.studentId, {
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

      if (result.success) {
        const newSchedules = await getAllAbsenceSchedules();
        setSchedules(newSchedules);
        setShowAddModal(false);
        resetForm();
      } else {
        alert(result.error || '일정 등록에 실패했습니다.');
      }
    }

    setIsLoading(false);
  };

  const handleDelete = async (schedule: ScheduleWithStudent) => {
    if (!confirm(`"${schedule.title}" 일정을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;

    startTransition(async () => {
      const result = await deleteAbsenceSchedule(schedule.id);
      if (result.success) {
        setSchedules(prev => prev.filter(s => s.id !== schedule.id));
      } else {
        alert(result.error || '삭제에 실패했습니다.');
      }
    });
  };

  const handleApprove = async (scheduleId: string) => {
    startTransition(async () => {
      const result = await approveAbsenceSchedule(scheduleId);
      if (result.success) {
        // 승인 대기 목록에서 제거하고 전체 목록 새로고침
        setPendingList(prev => prev.filter(s => s.id !== scheduleId));
        const newSchedules = await getAllAbsenceSchedules();
        setSchedules(newSchedules);
      } else {
        alert(result.error || '승인에 실패했습니다.');
      }
    });
  };

  const handleReject = async (scheduleId: string) => {
    if (!confirm('이 부재 일정 요청을 거부하시겠습니까? 거부된 일정은 삭제됩니다.')) return;
    
    startTransition(async () => {
      const result = await rejectAbsenceSchedule(scheduleId);
      if (result.success) {
        setPendingList(prev => prev.filter(s => s.id !== scheduleId));
      } else {
        alert(result.error || '거부에 실패했습니다.');
      }
    });
  };

  // 필터링된 스케줄 (승인된 것만)
  const filteredSchedules = useMemo(() => {
    return schedules.filter(schedule => {
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        if (
          !schedule.student_name?.toLowerCase().includes(searchLower) &&
          !schedule.title.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      if (filterType === 'recurring' && !schedule.is_recurring) return false;
      if (filterType === 'one_time' && schedule.is_recurring) return false;

      if (filterActive === 'active' && !schedule.is_active) return false;
      if (filterActive === 'inactive' && schedule.is_active) return false;

      // 승인 상태 필터
      if (filterStatus === 'approved' && schedule.status !== 'approved') return false;
      if (filterStatus === 'pending' && schedule.status !== 'pending') return false;

      return true;
    });
  }, [schedules, searchTerm, filterType, filterActive, filterStatus]);

  // 통계
  const stats = useMemo(() => {
    const active = schedules.filter(s => s.is_active && s.status === 'approved').length;
    const recurring = schedules.filter(s => s.is_recurring && s.status === 'approved').length;
    const oneTime = schedules.filter(s => !s.is_recurring && s.status === 'approved').length;
    const uniqueStudents = new Set(schedules.filter(s => s.status === 'approved').map(s => s.student_id)).size;
    const pending = pendingList.length;

    return { active, recurring, oneTime, uniqueStudents, total: schedules.filter(s => s.status === 'approved').length, pending };
  }, [schedules, pendingList]);

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '매일';
    if (days.length === 7) return '매일';
    return days.map(d => DAY_NAMES[d]).join(', ');
  };

  const formatTimeRange = (start: string, end: string) => {
    const startTime = start.slice(0, 5);
    const endTime = end.slice(0, 5);
    return `${startTime} ~ ${endTime}`;
  };

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
          <p className="text-gray-500 mt-1">학생들의 부재 일정을 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddModal(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            스케줄 추가
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </Button>
        </div>
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
      <div className="grid grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500">전체 스케줄</div>
          <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">활성 스케줄</div>
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
        </Card>
        <Card className={cn("p-4", stats.pending > 0 && "bg-amber-50 border-amber-200")}>
          <div className="text-sm text-gray-500">승인 대기</div>
          <div className={cn("text-2xl font-bold", stats.pending > 0 ? "text-amber-600" : "text-gray-400")}>{stats.pending}</div>
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

      {/* 승인 대기 섹션 */}
      {pendingList.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-gray-800">승인 대기 중인 부재 일정</h2>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-sm rounded-full">
              {pendingList.length}건
            </span>
          </div>
          <div className="space-y-3">
            {pendingList.map(schedule => (
              <div
                key={schedule.id}
                className="flex items-center justify-between p-3 bg-white rounded-xl border border-amber-100"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100'
                  }`}>
                    {schedule.is_recurring ? (
                      <Repeat className="w-5 h-5 text-primary" />
                    ) : (
                      <CalendarDays className="w-5 h-5 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-gray-800">{schedule.title}</div>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {schedule.student_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatTimeRange(schedule.start_time, schedule.end_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {schedule.is_recurring 
                          ? formatDaysOfWeek(schedule.day_of_week)
                          : schedule.specific_date 
                            ? format(new Date(schedule.specific_date), 'M/d', { locale: ko })
                            : '-'
                        }
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReject(schedule.id)}
                    disabled={isPending}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <X className="w-4 h-4 mr-1" />
                    거부
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(schedule.id)}
                    disabled={isPending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    승인
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(schedule)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-primary"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(schedule)}
                      disabled={isPending}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
                        !schedule.is_recurring
                          ? 'bg-amber-100 text-amber-700'
                          : schedule.date_type === 'semester' 
                          ? 'bg-blue-100 text-blue-700'
                          : schedule.date_type === 'vacation'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {schedule.is_recurring ? formatDateType(schedule.date_type) : '일회성'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-5 bg-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">{editingScheduleId ? '부재 스케줄 수정' : '부재 스케줄 추가'}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* 학생 선택 - 수정 모드에서는 숨김 */}
              {!editingScheduleId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    학생 선택 *
                  </label>
                  <select
                    value={formData.studentId}
                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">학생을 선택하세요</option>
                    {students.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.seatNumber ? `${student.seatNumber}번 ` : ''}{student.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                    setShowAddModal(false);
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
                  {editingScheduleId ? '수정' : '등록'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
