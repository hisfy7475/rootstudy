'use client';

import { useState, useMemo, useTransition, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  User,
  Search,
  Filter,
  RefreshCw,
  Repeat,
  CalendarDays,
  Info,
  Plus,
  X,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { StudentAbsenceSchedule } from '@/types/database';
import { approvedByCaption, type AbsenceScheduleListItem } from '@/lib/absence-approver-label';
import { DAY_NAMES, ABSENCE_BUFFER_MINUTES, SCHEDULE_DATE_TYPES, ABSENCE_REASONS } from '@/lib/constants';
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

interface ScheduleWithStudent extends AbsenceScheduleListItem {
  student_name?: string;
  seat_number?: number | null;
}

interface PendingScheduleWithStudent extends StudentAbsenceSchedule {
  student_name: string;
  seat_number?: number | null;
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
  branchId: string | null;
}

export default function SchedulesClient({ initialSchedules, pendingSchedules: initialPending, students, branchId }: SchedulesClientProps) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [pendingList, setPendingList] = useState(initialPending);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'recurring' | 'one_time'>('recurring');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'pending'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 학생 검색 상태
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const studentSearchRef = useRef<HTMLDivElement>(null);

  // 폼 상태
  const [formData, setFormData] = useState({
    studentId: '',
    reasonType: '' as string,
    customReason: '',
    description: '',
    isRecurring: true,
    dayOfWeek: [] as number[],
    startTime: '09:00',
    endTime: '10:00',
    dateType: 'all' as 'semester' | 'vacation' | 'all',
    specificDate: format(new Date(), 'yyyy-MM-dd'),
    recurringStartDate: format(new Date(), 'yyyy-MM-dd'),
    recurringEndDate: '',
  });

  const getTitle = () => {
    if (formData.reasonType === 'other') return formData.customReason.trim();
    const reason = ABSENCE_REASONS.find(r => r.value === formData.reasonType);
    return reason?.label || '';
  };

  const resetForm = () => {
    setFormData({
      studentId: '',
      reasonType: '',
      customReason: '',
      description: '',
      isRecurring: true,
      dayOfWeek: [],
      startTime: '09:00',
      endTime: '10:00',
      dateType: 'all',
      specificDate: format(new Date(), 'yyyy-MM-dd'),
      recurringStartDate: format(new Date(), 'yyyy-MM-dd'),
      recurringEndDate: '',
    });
    setEditingScheduleId(null);
    setStudentSearchQuery('');
    setShowStudentDropdown(false);
  };

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (studentSearchRef.current && !studentSearchRef.current.contains(e.target as Node)) {
        setShowStudentDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const MAX_DROPDOWN_ITEMS = 20;

  // 학생 검색 필터
  const filteredStudentOptions = useMemo(() => {
    if (!studentSearchQuery.trim()) return [];
    const q = studentSearchQuery.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.seatNumber != null && String(s.seatNumber).includes(q))
    );
  }, [students, studentSearchQuery]);

  const displayedStudentOptions = filteredStudentOptions.slice(0, MAX_DROPDOWN_ITEMS);
  const hasMoreStudents = filteredStudentOptions.length > MAX_DROPDOWN_ITEMS;

  const selectedStudent = useMemo(
    () => students.find(s => s.id === formData.studentId) ?? null,
    [students, formData.studentId]
  );

  const openEditModal = (schedule: ScheduleWithStudent) => {
    const foundReason = ABSENCE_REASONS.find(r => r.label === schedule.title);
    const reasonType = foundReason?.value || 'other';
    const customReason = reasonType === 'other' ? schedule.title : '';

    setFormData({
      studentId: schedule.student_id,
      reasonType,
      customReason,
      description: schedule.description || '',
      isRecurring: schedule.is_recurring,
      dayOfWeek: schedule.day_of_week || [],
      startTime: schedule.start_time.slice(0, 5),
      endTime: schedule.end_time.slice(0, 5),
      dateType: (schedule.date_type as 'semester' | 'vacation' | 'all') || 'all',
      specificDate: schedule.specific_date || format(new Date(), 'yyyy-MM-dd'),
      recurringStartDate: schedule.valid_from || format(new Date(), 'yyyy-MM-dd'),
      recurringEndDate: schedule.valid_until || '',
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
    if (!formData.reasonType) {
      alert('부재 사유를 선택해주세요.');
      return;
    }
    if (formData.reasonType === 'other' && !formData.customReason.trim()) {
      alert('기타 사유를 입력해주세요.');
      return;
    }
    const title = getTitle();
    if (!title) {
      alert('부재 사유를 입력해주세요.');
      return;
    }
    if (formData.isRecurring && formData.dayOfWeek.length === 0) {
      alert('반복 요일을 선택해주세요.');
      return;
    }
    if (formData.isRecurring && !formData.recurringStartDate) {
      alert('시작일을 선택해주세요.');
      return;
    }
    if (formData.isRecurring && formData.recurringEndDate && formData.recurringStartDate > formData.recurringEndDate) {
      alert('종료일은 시작일 이후여야 합니다.');
      return;
    }
    if (formData.startTime >= formData.endTime) {
      alert('종료 시간은 시작 시간 이후여야 합니다.');
      return;
    }

    setIsLoading(true);

    if (editingScheduleId) {
      const result = await updateAbsenceSchedule(editingScheduleId, {
        title: title,
        description: formData.description.trim() || null,
        is_recurring: formData.isRecurring,
        recurrence_type: formData.isRecurring ? 'weekly' : 'one_time',
        day_of_week: formData.isRecurring ? formData.dayOfWeek : null,
        start_time: formData.startTime + ':00',
        end_time: formData.endTime + ':00',
        date_type: formData.dateType,
        valid_from: formData.isRecurring ? formData.recurringStartDate : null,
        valid_until: formData.isRecurring && formData.recurringEndDate ? formData.recurringEndDate : null,
        specific_date: !formData.isRecurring ? formData.specificDate : null,
      });

      if (result.success) {
        const newSchedules = await getAllAbsenceSchedules(branchId);
        setSchedules(newSchedules);
        setShowAddModal(false);
        resetForm();
      } else {
        alert(result.error || '일정 수정에 실패했습니다.');
      }
    } else {
      const result = await createAbsenceScheduleForStudent(formData.studentId, {
        title: title,
        description: formData.description.trim() || undefined,
        is_recurring: formData.isRecurring,
        recurrence_type: formData.isRecurring ? 'weekly' : 'one_time',
        day_of_week: formData.isRecurring ? formData.dayOfWeek : undefined,
        start_time: formData.startTime + ':00',
        end_time: formData.endTime + ':00',
        date_type: formData.dateType,
        valid_from: formData.isRecurring ? formData.recurringStartDate : undefined,
        valid_until: formData.isRecurring && formData.recurringEndDate ? formData.recurringEndDate : undefined,
        specific_date: !formData.isRecurring ? formData.specificDate : undefined,
      });

      if (result.success) {
        const newSchedules = await getAllAbsenceSchedules(branchId);
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
        const newSchedules = await getAllAbsenceSchedules(branchId);
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

  const noSchedulesMatchNarrowFilters =
    Boolean(searchTerm.trim()) ||
    filterActive !== 'all' ||
    filterType === 'one_time' ||
    filterType === 'all';

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

      {/* 승인 대기 섹션 — 출석부와 유사한 컴팩트 테이블 */}
      {pendingList.length > 0 && (
        <Card className="p-3 border-amber-200 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-800">승인 대기</h2>
            <span className="px-1.5 py-0 bg-amber-100 text-amber-700 text-[11px] rounded">
              {pendingList.length}건
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-amber-100 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-amber-50/80 border-b border-amber-100">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-600 w-8"> </th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">좌석·이름</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-600">사유</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">시간</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-600">반복/날짜</th>
                  <th className="px-2 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">적용</th>
                  <th className="px-2 py-1.5 text-right font-medium text-gray-600 whitespace-nowrap w-[1%]">처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {pendingList.map(schedule => (
                  <tr key={schedule.id} className="hover:bg-amber-50/40">
                    <td className="px-2 py-1 align-middle">
                      <div
                        className={cn(
                          'w-7 h-7 rounded flex items-center justify-center shrink-0',
                          schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100'
                        )}
                      >
                        {schedule.is_recurring ? (
                          <Repeat className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1 align-middle whitespace-nowrap">
                      <span className="font-medium text-gray-800">
                        {schedule.seat_number != null ? `${schedule.seat_number}번 ` : ''}
                        {schedule.student_name}
                      </span>
                    </td>
                    <td className="px-2 py-1 align-middle text-gray-800 max-w-[140px] sm:max-w-[200px]">
                      <span className="truncate block" title={schedule.title}>
                        {schedule.title}
                      </span>
                    </td>
                    <td className="px-2 py-1 align-middle whitespace-nowrap text-gray-600 tabular-nums">
                      {formatTimeRange(schedule.start_time, schedule.end_time)}
                    </td>
                    <td className="px-2 py-1 align-middle text-gray-600">
                      {schedule.is_recurring
                        ? formatDaysOfWeek(schedule.day_of_week)
                        : schedule.specific_date
                          ? format(new Date(schedule.specific_date + 'T12:00:00+09:00'), 'M/d (eee)', { locale: ko })
                          : '—'}
                    </td>
                    <td className="px-2 py-1 align-middle whitespace-nowrap text-gray-500">
                      {formatDateType(schedule.date_type)}
                    </td>
                    <td className="px-2 py-1 align-middle text-right whitespace-nowrap">
                      <div className="inline-flex gap-1 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(schedule.id)}
                          disabled={isPending}
                          className="h-7 px-2 text-[11px] text-red-600 border-red-200 hover:bg-red-50"
                        >
                          거부
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(schedule.id)}
                          disabled={isPending}
                          className="h-7 px-2 text-[11px] bg-primary hover:bg-primary/90"
                        >
                          승인
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {/* 스케줄 목록 — 출석부와 유사한 컴팩트 테이블 */}
      {filteredSchedules.length === 0 ? (
        <Card className="p-6 text-center text-gray-500 text-sm">
          {noSchedulesMatchNarrowFilters
            ? '검색 결과가 없습니다.'
            : '등록된 부재 스케줄이 없습니다.'}
        </Card>
      ) : (
        <Card className="relative overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 w-8"> </th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">좌석·이름</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">사유·상태</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">시간</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">면제(버퍼)</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">반복/날짜</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">구분·기간</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">비고</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-600 w-[1%] whitespace-nowrap"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSchedules.map(schedule => (
                  <tr
                    key={schedule.id}
                    className={cn(
                      'hover:bg-gray-50',
                      !schedule.is_active && 'opacity-60 bg-gray-50/80'
                    )}
                  >
                    <td className="px-2 py-1.5 align-middle">
                      <div
                        className={cn(
                          'w-7 h-7 rounded flex items-center justify-center shrink-0',
                          schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100'
                        )}
                      >
                        {schedule.is_recurring ? (
                          <Repeat className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-800">
                          {schedule.seat_number != null ? `${schedule.seat_number}번 ` : ''}
                          {schedule.student_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium text-gray-800 truncate max-w-[120px] sm:max-w-[200px]" title={schedule.title}>
                          {schedule.title}
                        </span>
                        {!schedule.is_active && (
                          <span className="px-1 py-0 text-[10px] bg-gray-200 text-gray-600 rounded shrink-0">
                            비활성
                          </span>
                        )}
                        {schedule.status === 'approved' && (
                          <span
                            className="text-[10px] text-gray-500 truncate max-w-[160px]"
                            title={approvedByCaption(schedule.status, schedule.approver_display) ?? undefined}
                          >
                            {approvedByCaption(schedule.status, schedule.approver_display)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle whitespace-nowrap text-gray-700 tabular-nums">
                      {formatTimeRange(schedule.start_time, schedule.end_time)}
                    </td>
                    <td className="px-2 py-1.5 align-middle whitespace-nowrap text-[11px] text-gray-500 tabular-nums">
                      {formatExemptionRange(
                        schedule.start_time,
                        schedule.end_time,
                        schedule.buffer_minutes
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-gray-600">
                      {schedule.is_recurring ? (
                        <span>{formatDaysOfWeek(schedule.day_of_week)}</span>
                      ) : (
                        <span>
                          {schedule.specific_date
                            ? format(new Date(schedule.specific_date + 'T12:00:00+09:00'), 'M/d (eee)', { locale: ko })
                            : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-middle whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <span
                          className={cn(
                            'inline-block px-1.5 py-0 text-[10px] rounded',
                            !schedule.is_recurring
                              ? 'bg-amber-100 text-amber-700'
                              : schedule.date_type === 'semester'
                                ? 'bg-blue-100 text-blue-700'
                                : schedule.date_type === 'vacation'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600'
                          )}
                        >
                          {schedule.is_recurring ? formatDateType(schedule.date_type) : '일회성'}
                        </span>
                        {schedule.is_recurring && (schedule.valid_from || schedule.valid_until) && (
                          <span className="text-[10px] text-gray-500 tabular-nums">
                            {schedule.valid_from
                              ? format(new Date(schedule.valid_from + 'T12:00:00+09:00'), 'M/d', { locale: ko })
                              : ''}
                            ~
                            {schedule.valid_until
                              ? format(new Date(schedule.valid_until + 'T12:00:00+09:00'), 'M/d', { locale: ko })
                              : '∞'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle text-gray-500 max-w-[100px] sm:max-w-[180px]">
                      {schedule.description ? (
                        <span className="truncate block" title={schedule.description}>
                          {schedule.description}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(schedule)}
                        className="h-7 w-7 p-0 text-gray-400 hover:text-primary"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(schedule)}
                        disabled={isPending}
                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4 pb-28 sm:items-center sm:pb-4">
          <Card className="w-full max-w-md p-5 bg-white max-h-[80vh] overflow-y-auto">
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

            <div className="space-y-4 pb-8">
              {/* 학생 선택 - 수정 모드에서는 숨김 */}
              {!editingScheduleId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    학생 선택 *
                  </label>
                  <div ref={studentSearchRef} className="relative">
                    <div
                      className={cn(
                        "w-full h-10 px-3 flex items-center gap-2 rounded-xl border cursor-pointer bg-white",
                        showStudentDropdown
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-gray-200"
                      )}
                      onClick={() => {
                        setShowStudentDropdown(true);
                        setStudentSearchQuery('');
                      }}
                    >
                      <Search className="w-4 h-4 text-gray-400 shrink-0" />
                      {showStudentDropdown ? (
                        <input
                          autoFocus
                          className="flex-1 outline-none text-sm bg-transparent"
                          placeholder="이름 또는 좌석번호 검색"
                          value={studentSearchQuery}
                          onChange={e => setStudentSearchQuery(e.target.value)}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className={cn("flex-1 text-sm truncate", !selectedStudent && "text-gray-400")}>
                          {selectedStudent
                            ? `${selectedStudent.seatNumber != null ? `${selectedStudent.seatNumber}번 ` : ''}${selectedStudent.name}`
                            : '학생을 선택하세요'}
                        </span>
                      )}
                    </div>
                    {showStudentDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                        {!studentSearchQuery.trim() ? (
                          <div className="px-3 py-2 text-sm text-gray-400">이름 또는 좌석번호를 입력하세요</div>
                        ) : filteredStudentOptions.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</div>
                        ) : (
                          <>
                            {displayedStudentOptions.map(student => (
                              <div
                                key={student.id}
                                className={cn(
                                  "px-3 py-2 text-sm cursor-pointer hover:bg-primary/5",
                                  formData.studentId === student.id && "bg-primary/10 font-medium"
                                )}
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setFormData({ ...formData, studentId: student.id });
                                  setShowStudentDropdown(false);
                                  setStudentSearchQuery('');
                                }}
                              >
                                {student.seatNumber != null ? `${student.seatNumber}번 ` : ''}{student.name}
                              </div>
                            ))}
                            {hasMoreStudents && (
                              <div className="px-3 py-2 text-xs text-gray-400 text-center border-t">
                                외 {filteredStudentOptions.length - MAX_DROPDOWN_ITEMS}명 — 검색어를 더 입력하세요
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 부재 사유 */}
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
                        name="absenceReasonAdmin"
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

              {/* 기타 사유 직접 입력 */}
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
                    적용 구분
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

              {/* 반복 기간 설정 (시작일/종료일) */}
              {formData.isRecurring && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    적용 기간
                  </label>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        시작일 *
                      </label>
                      <Input
                        type="date"
                        value={formData.recurringStartDate}
                        onChange={(e) => setFormData({ ...formData, recurringStartDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        종료일 (선택)
                      </label>
                      <Input
                        type="date"
                        value={formData.recurringEndDate}
                        onChange={(e) => setFormData({ ...formData, recurringEndDate: e.target.value })}
                        min={formData.recurringStartDate}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        종료일을 비워두면 무기한 적용됩니다
                      </p>
                    </div>
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
