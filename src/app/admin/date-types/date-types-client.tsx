'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check } from 'lucide-react';
import {
  getDateTypeDefinitions,
  getDateAssignments,
  createDateTypeDefinition,
  updateDateTypeDefinition,
  deleteDateTypeDefinition,
  setDateAssignment,
  bulkSetDateAssignments,
  type DateTypeDefinition,
  type DateAssignment,
} from '@/lib/actions/date-type';
import { type Branch } from '@/lib/actions/branch';
import { getTodayKST, formatDateKST } from '@/lib/utils';

interface DateTypesClientProps {
  branches: Branch[];
  initialDateTypes: DateTypeDefinition[];
  initialAssignments: DateAssignment[];
  /** SSR 이 데이터를 로드한 지점 id. 초기 선택과 동기화하여 불필요한 재요청 방지. */
  initialBranchId: string;
}

export default function DateTypesClient({
  branches,
  initialDateTypes,
  initialAssignments,
  initialBranchId,
}: DateTypesClientProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId);
  const [dateTypes, setDateTypes] = useState(initialDateTypes);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);

  // 날짜 타입 편집
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeStartTime, setTypeStartTime] = useState('07:00');
  const [typeEndTime, setTypeEndTime] = useState('01:00');
  const [typeColor, setTypeColor] = useState('#7C9FF5');

  // 종료 시간이 시작 시간보다 이르면 익일로 판단
  const isNextDay = (startTime: string, endTime: string) => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes < startMinutes;
  };

  // 시간 표시 포맷 (익일 여부 포함)
  const formatTimeDisplay = (startTime: string, endTime: string) => {
    const nextDay = isNextDay(startTime, endTime);
    return `${startTime} ~ ${nextDay ? '익일 ' : ''}${endTime}`;
  };

  // 캘린더 선택
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  // 일괄 지정 모드
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState('');
  const [bulkTypeId, setBulkTypeId] = useState('');
  const [bulkDaysOfWeek, setBulkDaysOfWeek] = useState<number[]>([]);

  // 데이터 로드 — 이벤트 핸들러에서 명시적으로 호출 (지점/월 변경, mutation 후 리로드).
  // SSR 이 초기 데이터를 제공하므로 mount 효과로 자동 호출하지 않는다.
  // (react-hooks/set-state-in-effect 회피 — useEffect 안 setState cascade 방지)
  const loadData = async (branchId: string, month: Date) => {
    if (!branchId) return;

    setIsLoading(true);
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

    const [types, assigns] = await Promise.all([
      getDateTypeDefinitions(branchId),
      getDateAssignments(branchId, formatDateKST(startOfMonth), formatDateKST(endOfMonth)),
    ]);

    setDateTypes(types);
    setAssignments(assigns);
    setIsLoading(false);
  };

  // 지점 변경: state 갱신 + 즉시 새 지점 데이터 로드.
  const handleBranchChange = (nextBranchId: string) => {
    setSelectedBranchId(nextBranchId);
    void loadData(nextBranchId, currentMonth);
  };

  // 월 이동: state 갱신 + 즉시 새 월 데이터 로드.
  const handleMonthChange = (nextMonth: Date) => {
    setCurrentMonth(nextMonth);
    void loadData(selectedBranchId, nextMonth);
  };

  const reloadCurrent = () => loadData(selectedBranchId, currentMonth);

  // 날짜 타입 추가/수정
  const handleSaveType = async () => {
    if (!typeName.trim()) return;

    setIsLoading(true);
    if (editingTypeId) {
      await updateDateTypeDefinition(editingTypeId, {
        name: typeName,
        default_start_time: typeStartTime,
        default_end_time: typeEndTime,
        color: typeColor,
      });
    } else {
      await createDateTypeDefinition(
        selectedBranchId,
        typeName,
        typeStartTime,
        typeEndTime,
        typeColor,
      );
    }
    await reloadCurrent();
    resetTypeForm();
    setIsLoading(false);
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('이 날짜 타입을 삭제하시겠습니까?')) return;
    setIsLoading(true);
    await deleteDateTypeDefinition(id);
    await reloadCurrent();
    setIsLoading(false);
  };

  const handleEditType = (type: DateTypeDefinition) => {
    setEditingTypeId(type.id);
    setTypeName(type.name);
    setTypeStartTime(type.default_start_time);
    setTypeEndTime(type.default_end_time);
    setTypeColor(type.color);
    setShowTypeForm(true);
  };

  const resetTypeForm = () => {
    setShowTypeForm(false);
    setEditingTypeId(null);
    setTypeName('');
    setTypeStartTime('07:00');
    setTypeEndTime('01:00');
    setTypeColor('#7C9FF5');
  };

  // 캘린더 날짜 클릭
  const handleDateClick = async (date: string) => {
    if (!selectedTypeId) {
      setSelectedDate(date);
      return;
    }

    setIsLoading(true);
    await setDateAssignment(selectedBranchId, date, selectedTypeId);
    await reloadCurrent();
    setIsLoading(false);
  };

  // 일괄 지정
  const handleBulkAssign = async () => {
    if (!bulkStartDate || !bulkEndDate || !bulkTypeId) return;

    setIsLoading(true);
    await bulkSetDateAssignments(
      selectedBranchId,
      bulkStartDate,
      bulkEndDate,
      bulkTypeId,
      bulkDaysOfWeek.length > 0 ? bulkDaysOfWeek : undefined,
    );
    await reloadCurrent();
    setBulkMode(false);
    setBulkStartDate('');
    setBulkEndDate('');
    setBulkTypeId('');
    setBulkDaysOfWeek([]);
    setIsLoading(false);
  };

  // 캘린더 렌더링
  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: { date: string; assignment: DateAssignment | null }[] = [];

    // 이전 달 빈칸
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: '', assignment: null });
    }

    // 현재 달 날짜
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const assignment = assignments.find((a) => a.date === dateStr) || null;
      days.push({ date: dateStr, assignment });
    }

    return days;
  };

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const calendarDays = renderCalendar();

  return (
    <div className='space-y-6 p-6'>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-800'>날짜 타입 관리</h1>
          <p className='mt-1 text-gray-500'>날짜별 운영 유형(학기중/방학/특수)을 설정합니다.</p>
        </div>
        <div className='flex items-center gap-4'>
          <select
            value={selectedBranchId}
            onChange={(e) => handleBranchChange(e.target.value)}
            className='focus:ring-primary rounded-xl border border-gray-200 px-4 py-2 focus:ring-2 focus:outline-none'
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        {/* 날짜 타입 목록 */}
        <Card className='p-4'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='font-semibold text-gray-800'>날짜 타입</h2>
            <Button size='sm' onClick={() => setShowTypeForm(true)}>
              <Plus className='mr-1 h-4 w-4' />
              추가
            </Button>
          </div>

          {/* 타입 폼 */}
          {showTypeForm && (
            <div className='mb-4 space-y-3 rounded-xl bg-gray-50 p-3'>
              <Input
                placeholder='타입명 (예: 학기중)'
                value={typeName}
                onChange={(e) => setTypeName(e.target.value)}
              />
              <div className='flex gap-2'>
                <div className='flex-1'>
                  <label className='text-xs text-gray-500'>시작</label>
                  <Input
                    type='time'
                    value={typeStartTime}
                    onChange={(e) => setTypeStartTime(e.target.value)}
                  />
                </div>
                <div className='flex-1'>
                  <label className='text-xs text-gray-500'>
                    종료{' '}
                    {isNextDay(typeStartTime, typeEndTime) && (
                      <span className='text-primary font-medium'>(익일)</span>
                    )}
                  </label>
                  <Input
                    type='time'
                    value={typeEndTime}
                    onChange={(e) => setTypeEndTime(e.target.value)}
                  />
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <label className='text-xs text-gray-500'>색상</label>
                <input
                  type='color'
                  value={typeColor}
                  onChange={(e) => setTypeColor(e.target.value)}
                  className='h-8 w-8 cursor-pointer rounded'
                />
              </div>
              <div className='flex gap-2'>
                <Button size='sm' onClick={handleSaveType} disabled={isLoading}>
                  {editingTypeId ? '수정' : '추가'}
                </Button>
                <Button size='sm' variant='outline' onClick={resetTypeForm}>
                  취소
                </Button>
              </div>
            </div>
          )}

          {/* 타입 목록 */}
          <div className='space-y-2'>
            {dateTypes.map((type) => (
              <div
                key={type.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl p-3 ${
                  selectedTypeId === type.id ? 'ring-primary ring-2' : ''
                }`}
                style={{ backgroundColor: `${type.color}20` }}
                onClick={() => setSelectedTypeId(selectedTypeId === type.id ? null : type.id)}
              >
                <div className='flex items-center gap-3'>
                  <div className='h-4 w-4 rounded-full' style={{ backgroundColor: type.color }} />
                  <div>
                    <div className='font-medium text-gray-800'>{type.name}</div>
                    <div className='text-xs text-gray-500'>
                      {formatTimeDisplay(type.default_start_time, type.default_end_time)}
                    </div>
                  </div>
                </div>
                <div className='flex gap-1'>
                  {selectedTypeId === type.id && <Check className='text-primary h-4 w-4' />}
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditType(type);
                    }}
                  >
                    <Pencil className='h-3 w-3' />
                  </Button>
                  <Button
                    size='sm'
                    variant='ghost'
                    className='text-red-500'
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteType(type.id);
                    }}
                  >
                    <Trash2 className='h-3 w-3' />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {selectedTypeId && (
            <p className='mt-4 text-center text-sm text-gray-500'>
              타입 선택됨 - 캘린더에서 날짜를 클릭하세요
            </p>
          )}
        </Card>

        {/* 캘린더 */}
        <Card className='p-4 lg:col-span-2'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant='ghost'
                onClick={() =>
                  handleMonthChange(
                    new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1),
                  )
                }
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <h2 className='font-semibold text-gray-800'>
                {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
              </h2>
              <Button
                size='sm'
                variant='ghost'
                onClick={() =>
                  handleMonthChange(
                    new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1),
                  )
                }
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>
            <Button
              size='sm'
              variant={bulkMode ? 'default' : 'outline'}
              onClick={() => {
                if (!bulkMode && selectedTypeId) {
                  // 일괄지정 모드를 열 때 현재 선택된 타입을 자동으로 설정
                  setBulkTypeId(selectedTypeId);
                }
                setBulkMode(!bulkMode);
              }}
            >
              <Calendar className='mr-1 h-4 w-4' />
              일괄 지정
            </Button>
          </div>

          {/* 일괄 지정 폼 */}
          {bulkMode && (
            <div className='mb-4 space-y-3 rounded-xl bg-gray-50 p-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='text-sm text-gray-600'>시작일</label>
                  <Input
                    type='date'
                    value={bulkStartDate}
                    onChange={(e) => setBulkStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className='text-sm text-gray-600'>종료일</label>
                  <Input
                    type='date'
                    value={bulkEndDate}
                    onChange={(e) => setBulkEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className='text-sm text-gray-600'>날짜 타입</label>
                <select
                  value={bulkTypeId}
                  onChange={(e) => setBulkTypeId(e.target.value)}
                  className='focus:ring-primary w-full rounded-xl border border-gray-200 px-4 py-2 focus:ring-2 focus:outline-none'
                >
                  <option value=''>선택하세요</option>
                  {dateTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-2 block text-sm text-gray-600'>
                  적용 요일 (미선택시 모든 요일)
                </label>
                <div className='flex gap-2'>
                  {dayNames.map((day, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setBulkDaysOfWeek(
                          bulkDaysOfWeek.includes(idx)
                            ? bulkDaysOfWeek.filter((d) => d !== idx)
                            : [...bulkDaysOfWeek, idx],
                        );
                      }}
                      className={`h-10 w-10 rounded-lg text-sm font-medium ${
                        bulkDaysOfWeek.includes(idx)
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div className='flex gap-2'>
                <Button
                  onClick={handleBulkAssign}
                  disabled={isLoading || !bulkStartDate || !bulkEndDate || !bulkTypeId}
                >
                  일괄 적용
                </Button>
                <Button variant='outline' onClick={() => setBulkMode(false)}>
                  취소
                </Button>
              </div>
            </div>
          )}

          {/* 캘린더 그리드 */}
          <div className='grid grid-cols-7 gap-1'>
            {dayNames.map((day, idx) => (
              <div
                key={day}
                className={`py-2 text-center text-sm font-medium ${
                  idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-600'
                }`}
              >
                {day}
              </div>
            ))}
            {calendarDays.map((item, idx) => {
              if (!item.date) {
                return <div key={idx} className='h-16' />;
              }

              const dayNum = parseInt(item.date.split('-')[2]);
              const dayOfWeek = new Date(item.date).getDay();
              const typeColor = item.assignment?.date_type?.color;
              const typeName = item.assignment?.date_type?.name;
              const isToday = item.date === getTodayKST();

              return (
                <div
                  key={item.date}
                  onClick={() => handleDateClick(item.date)}
                  className={`h-16 cursor-pointer rounded-lg border-2 p-1 transition-all ${
                    isToday
                      ? 'border-primary ring-primary/30 ring-2'
                      : selectedDate === item.date
                        ? 'border-primary'
                        : 'border-transparent hover:border-gray-200'
                  }`}
                  style={typeColor ? { backgroundColor: `${typeColor}30` } : {}}
                >
                  <div
                    className={`flex items-center gap-1 text-sm font-medium ${
                      dayOfWeek === 0
                        ? 'text-red-500'
                        : dayOfWeek === 6
                          ? 'text-blue-500'
                          : 'text-gray-800'
                    }`}
                  >
                    {dayNum}
                    {isToday && (
                      <span className='bg-primary rounded-full px-1.5 py-0.5 text-xs text-white'>
                        오늘
                      </span>
                    )}
                  </div>
                  {typeName && (
                    <div
                      className='mt-1 truncate rounded px-1 py-0.5 text-xs text-white'
                      style={{ backgroundColor: typeColor }}
                    >
                      {typeName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
