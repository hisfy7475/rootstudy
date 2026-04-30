'use client';

import { useState, useMemo, useTransition, useRef, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import {
  User,
  Search,
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
import {
  DAY_NAMES,
  ABSENCE_BUFFER_MINUTES,
  SCHEDULE_DATE_TYPES,
  ABSENCE_REASONS,
  type ScheduleDateType,
} from '@/lib/constants';
import { format, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  createAbsenceScheduleForStudent,
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
  total: number;
  page: number;
  pageSize: number;
  pendingSchedules: PendingScheduleWithStudent[];
  students: StudentInfo[];
  branchId: string | null;
}

export default function SchedulesClient({
  initialSchedules,
  total,
  page,
  pageSize,
  pendingSchedules,
  students,
  branchId: _branchId,
}: SchedulesClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // 서버 페이지네이션이 적용된 행이 들어옴. 클라 필터링 없음.
  const schedules = initialSchedules;

  const q = sp.get('q') ?? '';
  const filterType = (sp.get('type') as 'recurring' | 'one_time' | null) ?? null;
  const filterActive = (sp.get('active') as 'active' | 'inactive' | null) ?? null;

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
    const reason = ABSENCE_REASONS.find((r) => r.value === formData.reasonType);
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
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.seatNumber != null && String(s.seatNumber).includes(q)),
    );
  }, [students, studentSearchQuery]);

  const displayedStudentOptions = filteredStudentOptions.slice(0, MAX_DROPDOWN_ITEMS);
  const hasMoreStudents = filteredStudentOptions.length > MAX_DROPDOWN_ITEMS;

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === formData.studentId) ?? null,
    [students, formData.studentId],
  );

  const openEditModal = (schedule: ScheduleWithStudent) => {
    const foundReason = ABSENCE_REASONS.find((r) => r.label === schedule.title);
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
      setFormData({ ...formData, dayOfWeek: formData.dayOfWeek.filter((d) => d !== day) });
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
    if (
      formData.isRecurring &&
      formData.recurringEndDate &&
      formData.recurringStartDate > formData.recurringEndDate
    ) {
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
        valid_until:
          formData.isRecurring && formData.recurringEndDate ? formData.recurringEndDate : null,
        specific_date: !formData.isRecurring ? formData.specificDate : null,
      });

      if (result.success) {
        router.refresh();
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
        valid_until:
          formData.isRecurring && formData.recurringEndDate ? formData.recurringEndDate : undefined,
        specific_date: !formData.isRecurring ? formData.specificDate : undefined,
      });

      if (result.success) {
        router.refresh();
        setShowAddModal(false);
        resetForm();
      } else {
        alert(result.error || '일정 등록에 실패했습니다.');
      }
    }

    setIsLoading(false);
  };

  const handleDelete = async (schedule: ScheduleWithStudent) => {
    if (!confirm(`"${schedule.title}" 일정을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`))
      return;

    startTransition(async () => {
      const result = await deleteAbsenceSchedule(schedule.id);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error || '삭제에 실패했습니다.');
      }
    });
  };

  const handleApprove = async (scheduleId: string) => {
    startTransition(async () => {
      const result = await approveAbsenceSchedule(scheduleId);
      if (result.success) {
        router.refresh();
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
        router.refresh();
      } else {
        alert(result.error || '거부에 실패했습니다.');
      }
    });
  };

  const hasNarrowFilters = Boolean(q.trim()) || filterType !== null || filterActive !== null;

  const formatDaysOfWeek = (days: number[] | null) => {
    if (!days || days.length === 0) return '매일';
    if (days.length === 7) return '매일';
    return days.map((d) => DAY_NAMES[d]).join(', ');
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
      if (mins < 0) {
        hours--;
        mins += 60;
      }
      if (mins >= 60) {
        hours++;
        mins -= 60;
      }
      if (hours < 0) hours += 24;
      if (hours >= 24) hours -= 24;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    return `${formatTime(exemptStartH, exemptStartM)} ~ ${formatTime(exemptEndH, exemptEndM)}`;
  };

  const formatDateType = (dateType: string | null) => {
    switch (dateType) {
      case 'semester':
        return '학기중';
      case 'vacation':
        return '방학';
      case 'all':
        return '항상';
      default:
        return '항상';
    }
  };

  return (
    <div className='space-y-6 p-6'>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-800'>부재 스케줄 관리</h1>
          <p className='mt-1 text-gray-500'>학생들의 부재 일정을 관리합니다.</p>
        </div>
        <div className='flex gap-2'>
          <Button onClick={() => setShowAddModal(true)} className='flex items-center gap-2'>
            <Plus className='h-4 w-4' />
            스케줄 추가
          </Button>
          <Button
            variant='outline'
            onClick={() => window.location.reload()}
            className='flex items-center gap-2'
          >
            <RefreshCw className='h-4 w-4' />
            새로고침
          </Button>
        </div>
      </div>

      {/* 버퍼 시간 안내 */}
      <Card className='border-blue-200 bg-blue-50 p-4'>
        <div className='flex items-start gap-3'>
          <Info className='mt-0.5 h-5 w-5 text-blue-500' />
          <div>
            <p className='font-medium text-blue-800'>면제 시간 버퍼 안내</p>
            <p className='mt-1 text-sm text-blue-600'>
              등록된 부재 시간 앞뒤로 {ABSENCE_BUFFER_MINUTES}분씩 버퍼가 적용됩니다. 버퍼 시간을
              포함한 전체 구간 동안 알림과 벌점이 면제됩니다.
            </p>
          </div>
        </div>
      </Card>

      {/* 승인 대기 섹션 — 출석부와 유사한 컴팩트 테이블 */}
      {pendingSchedules.length > 0 && (
        <Card className='border-amber-200 bg-amber-50/50 p-3'>
          <div className='mb-2 flex items-center gap-2'>
            <AlertCircle className='h-4 w-4 shrink-0 text-amber-500' />
            <h2 className='text-sm font-semibold text-gray-800'>승인 대기</h2>
            <span className='rounded bg-amber-100 px-1.5 py-0 text-[11px] text-amber-700'>
              {pendingSchedules.length}건
            </span>
          </div>
          <div className='overflow-x-auto rounded-lg border border-amber-100 bg-white'>
            <table className='w-full text-xs'>
              <thead className='border-b border-amber-100 bg-amber-50/80'>
                <tr>
                  <th className='w-8 px-2 py-1.5 text-left font-medium text-gray-600'> </th>
                  <th className='px-2 py-1.5 text-left font-medium whitespace-nowrap text-gray-600'>
                    좌석·이름
                  </th>
                  <th className='px-2 py-1.5 text-left font-medium text-gray-600'>사유</th>
                  <th className='px-2 py-1.5 text-left font-medium whitespace-nowrap text-gray-600'>
                    시간
                  </th>
                  <th className='px-2 py-1.5 text-left font-medium text-gray-600'>반복/날짜</th>
                  <th className='px-2 py-1.5 text-left font-medium whitespace-nowrap text-gray-600'>
                    적용
                  </th>
                  <th className='w-[1%] px-2 py-1.5 text-right font-medium whitespace-nowrap text-gray-600'>
                    처리
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-amber-50'>
                {pendingSchedules.map((schedule) => (
                  <tr key={schedule.id} className='hover:bg-amber-50/40'>
                    <td className='px-2 py-1 align-middle'>
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded',
                          schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100',
                        )}
                      >
                        {schedule.is_recurring ? (
                          <Repeat className='text-primary h-3.5 w-3.5' />
                        ) : (
                          <CalendarDays className='h-3.5 w-3.5 text-amber-600' />
                        )}
                      </div>
                    </td>
                    <td className='px-2 py-1 align-middle whitespace-nowrap'>
                      <span className='font-medium text-gray-800'>
                        {schedule.seat_number != null ? `${schedule.seat_number}번 ` : ''}
                        {schedule.student_name}
                      </span>
                    </td>
                    <td className='max-w-[140px] px-2 py-1 align-middle text-gray-800 sm:max-w-[200px]'>
                      <span className='block truncate' title={schedule.title}>
                        {schedule.title}
                      </span>
                    </td>
                    <td className='px-2 py-1 align-middle whitespace-nowrap text-gray-600 tabular-nums'>
                      {formatTimeRange(schedule.start_time, schedule.end_time)}
                    </td>
                    <td className='px-2 py-1 align-middle text-gray-600'>
                      {schedule.is_recurring
                        ? formatDaysOfWeek(schedule.day_of_week)
                        : schedule.specific_date
                          ? format(
                              new Date(schedule.specific_date + 'T12:00:00+09:00'),
                              'M/d (eee)',
                              { locale: ko },
                            )
                          : '—'}
                    </td>
                    <td className='px-2 py-1 align-middle whitespace-nowrap text-gray-500'>
                      {formatDateType(schedule.date_type)}
                    </td>
                    <td className='px-2 py-1 text-right align-middle whitespace-nowrap'>
                      <div className='inline-flex justify-end gap-1'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => handleReject(schedule.id)}
                          disabled={isPending}
                          className='h-7 border-red-200 px-2 text-[11px] text-red-600 hover:bg-red-50'
                        >
                          거부
                        </Button>
                        <Button
                          size='sm'
                          onClick={() => handleApprove(schedule.id)}
                          disabled={isPending}
                          className='bg-primary hover:bg-primary/90 h-7 px-2 text-[11px]'
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

      {/* 검색·필터·페이지사이즈 */}
      <DataTableToolbar
        searchPlaceholder='학생 이름 또는 일정 제목 검색'
        filters={[
          {
            key: 'type',
            label: '유형',
            allLabel: '모든 유형',
            options: [
              { value: 'recurring', label: '반복 일정' },
              { value: 'one_time', label: '일회성 일정' },
            ],
          },
          {
            key: 'active',
            label: '상태',
            allLabel: '모든 상태',
            options: [
              { value: 'active', label: '활성' },
              { value: 'inactive', label: '비활성' },
            ],
          },
        ]}
      />

      {/* 스케줄 목록 — 출석부와 유사한 컴팩트 테이블 */}
      {schedules.length === 0 ? (
        <Card className='p-6 text-center text-sm text-gray-500'>
          {hasNarrowFilters ? '검색 결과가 없습니다.' : '등록된 부재 스케줄이 없습니다.'}
        </Card>
      ) : (
        <Card className='relative overflow-hidden p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-xs'>
              <thead className='border-b bg-gray-50'>
                <tr>
                  <th className='w-8 px-2 py-2 text-left font-medium text-gray-600'> </th>
                  <th className='px-2 py-2 text-left font-medium whitespace-nowrap text-gray-600'>
                    좌석·이름
                  </th>
                  <th className='px-2 py-2 text-left font-medium text-gray-600'>사유·상태</th>
                  <th className='px-2 py-2 text-left font-medium whitespace-nowrap text-gray-600'>
                    시간
                  </th>
                  <th className='px-2 py-2 text-left font-medium whitespace-nowrap text-gray-600'>
                    면제(버퍼)
                  </th>
                  <th className='px-2 py-2 text-left font-medium text-gray-600'>반복/날짜</th>
                  <th className='px-2 py-2 text-left font-medium whitespace-nowrap text-gray-600'>
                    구분·기간
                  </th>
                  <th className='px-2 py-2 text-left font-medium text-gray-600'>비고</th>
                  <th className='w-[1%] px-2 py-2 text-right font-medium whitespace-nowrap text-gray-600'>
                    {' '}
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {schedules.map((schedule) => (
                  <tr
                    key={schedule.id}
                    className={cn(
                      'hover:bg-gray-50',
                      !schedule.is_active && 'bg-gray-50/80 opacity-60',
                    )}
                  >
                    <td className='px-2 py-1.5 align-middle'>
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded',
                          schedule.is_recurring ? 'bg-primary/10' : 'bg-amber-100',
                        )}
                      >
                        {schedule.is_recurring ? (
                          <Repeat className='text-primary h-3.5 w-3.5' />
                        ) : (
                          <CalendarDays className='h-3.5 w-3.5 text-amber-600' />
                        )}
                      </div>
                    </td>
                    <td className='px-2 py-1.5 align-middle whitespace-nowrap'>
                      <div className='flex items-center gap-1'>
                        <User className='h-3 w-3 shrink-0 text-gray-400' />
                        <span className='font-medium text-gray-800'>
                          {schedule.seat_number != null ? `${schedule.seat_number}번 ` : ''}
                          {schedule.student_name}
                        </span>
                      </div>
                    </td>
                    <td className='px-2 py-1.5 align-middle'>
                      <div className='flex flex-wrap items-center gap-1'>
                        <span
                          className='max-w-[120px] truncate font-medium text-gray-800 sm:max-w-[200px]'
                          title={schedule.title}
                        >
                          {schedule.title}
                        </span>
                        {!schedule.is_active && (
                          <span className='shrink-0 rounded bg-gray-200 px-1 py-0 text-[10px] text-gray-600'>
                            비활성
                          </span>
                        )}
                        {schedule.status === 'approved' && (
                          <span
                            className='max-w-[160px] truncate text-[10px] text-gray-500'
                            title={
                              approvedByCaption(schedule.status, schedule.approver_display) ??
                              undefined
                            }
                          >
                            {approvedByCaption(schedule.status, schedule.approver_display)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className='px-2 py-1.5 align-middle whitespace-nowrap text-gray-700 tabular-nums'>
                      {formatTimeRange(schedule.start_time, schedule.end_time)}
                    </td>
                    <td className='px-2 py-1.5 align-middle text-[11px] whitespace-nowrap text-gray-500 tabular-nums'>
                      {formatExemptionRange(
                        schedule.start_time,
                        schedule.end_time,
                        schedule.buffer_minutes,
                      )}
                    </td>
                    <td className='px-2 py-1.5 align-middle text-gray-600'>
                      {schedule.is_recurring ? (
                        <span>{formatDaysOfWeek(schedule.day_of_week)}</span>
                      ) : (
                        <span>
                          {schedule.specific_date
                            ? format(
                                new Date(schedule.specific_date + 'T12:00:00+09:00'),
                                'M/d (eee)',
                                { locale: ko },
                              )
                            : '—'}
                        </span>
                      )}
                    </td>
                    <td className='px-2 py-1.5 align-middle whitespace-nowrap'>
                      <div className='flex flex-wrap items-center gap-1'>
                        <span
                          className={cn(
                            'inline-block rounded px-1.5 py-0 text-[10px]',
                            !schedule.is_recurring
                              ? 'bg-amber-100 text-amber-700'
                              : schedule.date_type === 'semester'
                                ? 'bg-blue-100 text-blue-700'
                                : schedule.date_type === 'vacation'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {schedule.is_recurring ? formatDateType(schedule.date_type) : '일회성'}
                        </span>
                        {schedule.is_recurring && (schedule.valid_from || schedule.valid_until) && (
                          <span className='text-[10px] text-gray-500 tabular-nums'>
                            {schedule.valid_from
                              ? format(new Date(schedule.valid_from + 'T12:00:00+09:00'), 'M/d', {
                                  locale: ko,
                                })
                              : ''}
                            ~
                            {schedule.valid_until
                              ? format(new Date(schedule.valid_until + 'T12:00:00+09:00'), 'M/d', {
                                  locale: ko,
                                })
                              : '∞'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className='max-w-[100px] px-2 py-1.5 align-middle text-gray-500 sm:max-w-[180px]'>
                      {schedule.description ? (
                        <span className='block truncate' title={schedule.description}>
                          {schedule.description}
                        </span>
                      ) : (
                        <span className='text-gray-300'>—</span>
                      )}
                    </td>
                    <td className='px-2 py-1.5 text-right align-middle whitespace-nowrap'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => openEditModal(schedule)}
                        className='hover:text-primary h-7 w-7 p-0 text-gray-400'
                      >
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => handleDelete(schedule)}
                        disabled={isPending}
                        className='h-7 w-7 p-0 text-gray-400 hover:text-red-500'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {schedules.length > 0 && (
        <div className='flex justify-center'>
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            pathname={pathname}
            searchParams={new URLSearchParams(sp.toString())}
          />
        </div>
      )}

      {/* 추가 모달 */}
      {showAddModal && (
        <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-28 sm:items-center sm:pb-4'>
          <Card className='max-h-[80vh] w-full max-w-md overflow-y-auto bg-white p-5'>
            <div className='mb-4 flex items-center justify-between'>
              <h3 className='text-lg font-bold'>
                {editingScheduleId ? '부재 스케줄 수정' : '부재 스케줄 추가'}
              </h3>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                <X className='h-5 w-5' />
              </Button>
            </div>

            <div className='space-y-4 pb-8'>
              {/* 학생 선택 - 수정 모드에서는 숨김 */}
              {!editingScheduleId && (
                <div>
                  <label className='mb-1 block text-sm font-medium text-gray-700'>
                    학생 선택 *
                  </label>
                  <div ref={studentSearchRef} className='relative'>
                    <div
                      className={cn(
                        'flex h-10 w-full cursor-pointer items-center gap-2 rounded-xl border bg-white px-3',
                        showStudentDropdown
                          ? 'border-primary ring-primary/20 ring-2'
                          : 'border-gray-200',
                      )}
                      onClick={() => {
                        setShowStudentDropdown(true);
                        setStudentSearchQuery('');
                      }}
                    >
                      <Search className='h-4 w-4 shrink-0 text-gray-400' />
                      {showStudentDropdown ? (
                        <input
                          autoFocus
                          className='flex-1 bg-transparent text-sm outline-none'
                          placeholder='이름 또는 좌석번호 검색'
                          value={studentSearchQuery}
                          onChange={(e) => setStudentSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className={cn(
                            'flex-1 truncate text-sm',
                            !selectedStudent && 'text-gray-400',
                          )}
                        >
                          {selectedStudent
                            ? `${selectedStudent.seatNumber != null ? `${selectedStudent.seatNumber}번 ` : ''}${selectedStudent.name}`
                            : '학생을 선택하세요'}
                        </span>
                      )}
                    </div>
                    {showStudentDropdown && (
                      <div className='absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg'>
                        {!studentSearchQuery.trim() ? (
                          <div className='px-3 py-2 text-sm text-gray-400'>
                            이름 또는 좌석번호를 입력하세요
                          </div>
                        ) : filteredStudentOptions.length === 0 ? (
                          <div className='px-3 py-2 text-sm text-gray-400'>검색 결과 없음</div>
                        ) : (
                          <>
                            {displayedStudentOptions.map((student) => (
                              <div
                                key={student.id}
                                className={cn(
                                  'hover:bg-primary/5 cursor-pointer px-3 py-2 text-sm',
                                  formData.studentId === student.id && 'bg-primary/10 font-medium',
                                )}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setFormData({ ...formData, studentId: student.id });
                                  setShowStudentDropdown(false);
                                  setStudentSearchQuery('');
                                }}
                              >
                                {student.seatNumber != null ? `${student.seatNumber}번 ` : ''}
                                {student.name}
                              </div>
                            ))}
                            {hasMoreStudents && (
                              <div className='border-t px-3 py-2 text-center text-xs text-gray-400'>
                                외 {filteredStudentOptions.length - MAX_DROPDOWN_ITEMS}명 — 검색어를
                                더 입력하세요
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
                <label className='mb-2 block text-sm font-medium text-gray-700'>부재 사유 *</label>
                <div className='space-y-2'>
                  {ABSENCE_REASONS.map((reason) => (
                    <label
                      key={reason.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        formData.reasonType === reason.value
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type='radio'
                        name='absenceReasonAdmin'
                        value={reason.value}
                        checked={formData.reasonType === reason.value}
                        onChange={(e) =>
                          setFormData({ ...formData, reasonType: e.target.value, customReason: '' })
                        }
                        className='text-primary h-4 w-4'
                      />
                      <span className='text-sm text-gray-700'>{reason.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 기타 사유 직접 입력 */}
              {formData.reasonType === 'other' && (
                <div>
                  <label className='mb-1 block text-sm font-medium text-gray-700'>
                    기타 사유 입력 *
                  </label>
                  <Input
                    value={formData.customReason}
                    onChange={(e) => setFormData({ ...formData, customReason: e.target.value })}
                    placeholder='부재 사유를 입력해주세요'
                  />
                </div>
              )}

              {/* 설명 */}
              <div>
                <label className='mb-1 block text-sm font-medium text-gray-700'>설명 (선택)</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder='추가 설명'
                />
              </div>

              {/* 반복 여부 */}
              <div>
                <label className='mb-2 block text-sm font-medium text-gray-700'>일정 유형</label>
                <div className='flex gap-2'>
                  <Button
                    variant={formData.isRecurring ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => setFormData({ ...formData, isRecurring: true })}
                    className='flex-1'
                  >
                    <Repeat className='mr-2 h-4 w-4' />
                    매주 반복
                  </Button>
                  <Button
                    variant={!formData.isRecurring ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => setFormData({ ...formData, isRecurring: false })}
                    className='flex-1'
                  >
                    <CalendarDays className='mr-2 h-4 w-4' />
                    일회성
                  </Button>
                </div>
              </div>

              {/* 반복 요일 선택 */}
              {formData.isRecurring && (
                <div>
                  <label className='mb-2 block text-sm font-medium text-gray-700'>
                    반복 요일 *
                  </label>
                  <div className='flex gap-1'>
                    {DAY_NAMES.map((day, index) => (
                      <Button
                        key={index}
                        variant={formData.dayOfWeek.includes(index) ? 'default' : 'outline'}
                        size='sm'
                        onClick={() => handleDayToggle(index)}
                        className='flex-1 px-0'
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
                  <label className='mb-1 block text-sm font-medium text-gray-700'>날짜 *</label>
                  <Input
                    type='date'
                    value={formData.specificDate}
                    onChange={(e) => setFormData({ ...formData, specificDate: e.target.value })}
                    min={format(new Date(), 'yyyy-MM-dd')}
                  />
                </div>
              )}

              {/* 시간 설정 */}
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='mb-1 block text-sm font-medium text-gray-700'>
                    시작 시간 *
                  </label>
                  <Input
                    type='time'
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className='mb-1 block text-sm font-medium text-gray-700'>
                    종료 시간 *
                  </label>
                  <Input
                    type='time'
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  />
                </div>
              </div>

              {/* 날짜 타입 */}
              {formData.isRecurring && (
                <div>
                  <label className='mb-2 block text-sm font-medium text-gray-700'>적용 구분</label>
                  <div className='flex gap-2'>
                    {Object.entries(SCHEDULE_DATE_TYPES).map(([key, value]) => (
                      <Button
                        key={key}
                        variant={formData.dateType === value ? 'default' : 'outline'}
                        size='sm'
                        onClick={() =>
                          setFormData({
                            ...formData,
                            dateType: value as ScheduleDateType,
                          })
                        }
                        className='flex-1'
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
                  <label className='mb-2 block text-sm font-medium text-gray-700'>적용 기간</label>
                  <div className='space-y-3'>
                    <div>
                      <label className='mb-1 block text-xs text-gray-500'>시작일 *</label>
                      <Input
                        type='date'
                        value={formData.recurringStartDate}
                        onChange={(e) =>
                          setFormData({ ...formData, recurringStartDate: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className='mb-1 block text-xs text-gray-500'>종료일 (선택)</label>
                      <Input
                        type='date'
                        value={formData.recurringEndDate}
                        onChange={(e) =>
                          setFormData({ ...formData, recurringEndDate: e.target.value })
                        }
                        min={formData.recurringStartDate}
                      />
                      <p className='mt-1 text-xs text-gray-400'>
                        종료일을 비워두면 무기한 적용됩니다
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 저장 버튼 */}
              <div className='flex gap-2 pt-2'>
                <Button
                  variant='outline'
                  className='flex-1'
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                >
                  취소
                </Button>
                <Button className='flex-1' onClick={handleSubmit} disabled={isLoading}>
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
