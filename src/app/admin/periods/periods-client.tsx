'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, Plus, Pencil, Trash2, Copy, X, Check, Calendar } from 'lucide-react';
import {
  getPeriodDefinitions,
  createPeriodDefinition,
  updatePeriodDefinition,
  deletePeriodDefinition,
  copyPeriodsToDateType,
} from '@/lib/actions/period';
import { getDateTypeDefinitions } from '@/lib/actions/date-type';
import type { DateTypeDefinition } from '@/lib/actions/date-type';
import type { PeriodDefinition } from '@/lib/actions/period';

interface Branch {
  id: string;
  name: string;
}

interface PeriodsClientProps {
  branches: Branch[];
  initialDateTypes: DateTypeDefinition[];
  initialPeriods: PeriodDefinition[];
  /** SSR 이 데이터를 로드한 지점 id. 초기 선택과 동기화하여 불필요한 재요청 방지. */
  initialBranchId: string;
}

export default function PeriodsClient({
  branches,
  initialDateTypes,
  initialPeriods,
  initialBranchId,
}: PeriodsClientProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranchId);
  const [selectedDateTypeId, setSelectedDateTypeId] = useState('');
  const [dateTypes, setDateTypes] = useState(initialDateTypes);
  const [periods, setPeriods] = useState(initialPeriods);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargetBranchId, setCopyTargetBranchId] = useState('');
  const [copyTargetDateTypeId, setCopyTargetDateTypeId] = useState('');
  const [copyTargetDateTypes, setCopyTargetDateTypes] = useState<DateTypeDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 새 교시 추가 폼
  const [newPeriodNumber, setNewPeriodNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');

  // 수정 폼
  const [editPeriodNumber, setEditPeriodNumber] = useState('');
  const [editName, setEditName] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // 데이터 로드 — 이벤트 핸들러에서 명시적으로 호출.
  // SSR 이 초기 데이터를 제공하므로 mount 효과로 자동 호출하지 않는다.
  // (react-hooks/set-state-in-effect 회피 — useEffect 안 setState cascade 방지)
  const loadAllData = async (branchId: string, dateTypeId: string) => {
    if (!branchId) return;
    setIsLoading(true);
    const [newDateTypes, newPeriods] = await Promise.all([
      getDateTypeDefinitions(branchId),
      getPeriodDefinitions(branchId, dateTypeId || undefined),
    ]);
    setDateTypes(newDateTypes);
    setPeriods(newPeriods);
    setIsLoading(false);
  };

  const loadPeriodsOnly = async (branchId: string, dateTypeId: string) => {
    if (!branchId) return;
    const newPeriods = await getPeriodDefinitions(branchId, dateTypeId || undefined);
    setPeriods(newPeriods);
  };

  const handleBranchChange = (nextBranchId: string) => {
    setSelectedBranchId(nextBranchId);
    setSelectedDateTypeId('');
    void loadAllData(nextBranchId, '');
  };

  const handleDateTypeChange = (nextDateTypeId: string) => {
    setSelectedDateTypeId(nextDateTypeId);
    void loadPeriodsOnly(selectedBranchId, nextDateTypeId);
  };

  const handleCopyTargetBranchChange = async (nextBranchId: string) => {
    setCopyTargetBranchId(nextBranchId);
    setCopyTargetDateTypeId('');
    if (nextBranchId) {
      const types = await getDateTypeDefinitions(nextBranchId);
      setCopyTargetDateTypes(types);
    } else {
      setCopyTargetDateTypes([]);
    }
  };

  const reloadPeriods = () => loadPeriodsOnly(selectedBranchId, selectedDateTypeId);

  const handleAdd = async () => {
    if (!selectedDateTypeId || !newPeriodNumber || !newStartTime || !newEndTime) {
      alert('날짜 타입, 교시 번호, 시작 시간, 종료 시간을 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const result = await createPeriodDefinition(
      selectedBranchId,
      selectedDateTypeId,
      parseInt(newPeriodNumber),
      newStartTime,
      newEndTime,
      newName || undefined,
    );

    if (result.success) {
      await reloadPeriods();
      setNewPeriodNumber('');
      setNewName('');
      setNewStartTime('');
      setNewEndTime('');
      setShowAddForm(false);
    } else if (result.error) {
      alert(result.error);
    }
    setIsLoading(false);
  };

  const handleEdit = (period: PeriodDefinition) => {
    setEditingId(period.id);
    setEditPeriodNumber(period.period_number.toString());
    setEditName(period.name || '');
    setEditStartTime(period.start_time.substring(0, 5)); // HH:mm
    setEditEndTime(period.end_time.substring(0, 5));
  };

  const handleSaveEdit = async (id: string) => {
    if (!editPeriodNumber || !editStartTime || !editEndTime) {
      alert('교시 번호, 시작 시간, 종료 시간을 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const result = await updatePeriodDefinition(id, {
      period_number: parseInt(editPeriodNumber),
      name: editName || null,
      start_time: editStartTime,
      end_time: editEndTime,
    });

    if (result.success) {
      await reloadPeriods();
      setEditingId(null);
    } else if (result.error) {
      alert(result.error);
    }
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 교시를 삭제하시겠습니까?')) return;

    setIsLoading(true);
    const result = await deletePeriodDefinition(id);

    if (result.success) {
      setPeriods(periods.filter((p) => p.id !== id));
    } else if (result.error) {
      alert(result.error);
    }
    setIsLoading(false);
  };

  const handleCopy = async () => {
    if (!selectedDateTypeId || !copyTargetBranchId || !copyTargetDateTypeId) {
      alert('복사할 지점과 날짜 타입을 선택해주세요.');
      return;
    }

    if (selectedBranchId === copyTargetBranchId && selectedDateTypeId === copyTargetDateTypeId) {
      alert('다른 지점 또는 날짜 타입을 선택해주세요.');
      return;
    }

    setIsLoading(true);
    const result = await copyPeriodsToDateType(
      selectedBranchId,
      selectedDateTypeId,
      copyTargetBranchId,
      copyTargetDateTypeId,
    );

    if (result.success) {
      alert(`${result.count}개의 교시가 복사되었습니다.`);
      setShowCopyModal(false);
      setCopyTargetBranchId('');
      setCopyTargetDateTypeId('');
    } else if (result.error) {
      alert(result.error);
    }
    setIsLoading(false);
  };

  // 시간 포맷팅
  const formatTime = (time: string) => {
    return time.substring(0, 5);
  };

  // 선택된 날짜 타입의 교시 목록
  const filteredPeriods = selectedDateTypeId
    ? periods.filter((p) => p.date_type_id === selectedDateTypeId)
    : periods;

  // 날짜 타입별로 그룹화
  const groupedPeriods = periods.reduce(
    (acc, period) => {
      const dateTypeId = period.date_type_id;
      if (!acc[dateTypeId]) {
        acc[dateTypeId] = [];
      }
      acc[dateTypeId].push(period);
      return acc;
    },
    {} as Record<string, PeriodDefinition[]>,
  );

  return (
    <div className='mx-auto max-w-6xl p-6'>
      {/* 헤더 */}
      <div className='mb-6'>
        <h1 className='text-text mb-2 text-2xl font-bold'>교시 관리</h1>
        <p className='text-text-muted'>날짜 타입별 시간표(교시)를 설정합니다.</p>
      </div>

      {/* 필터 */}
      <Card className='mb-6 p-4'>
        <div className='flex flex-wrap items-end gap-4'>
          {/* 지점 선택 */}
          <div className='min-w-[200px] flex-1'>
            <label className='text-text mb-1 block text-sm font-medium'>지점</label>
            <select
              value={selectedBranchId}
              onChange={(e) => handleBranchChange(e.target.value)}
              className='focus:ring-primary/50 w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:outline-none'
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          {/* 날짜 타입 선택 */}
          <div className='min-w-[200px] flex-1'>
            <label className='text-text mb-1 block text-sm font-medium'>날짜 타입</label>
            <select
              value={selectedDateTypeId}
              onChange={(e) => handleDateTypeChange(e.target.value)}
              className='focus:ring-primary/50 w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:outline-none'
            >
              <option value=''>전체 보기</option>
              {dateTypes.map((dt) => (
                <option key={dt.id} value={dt.id}>
                  {dt.name}
                </option>
              ))}
            </select>
          </div>

          {/* 버튼들 */}
          <div className='flex gap-2'>
            {selectedDateTypeId && filteredPeriods.length > 0 && (
              <Button variant='outline' onClick={() => setShowCopyModal(true)} disabled={isLoading}>
                <Copy className='mr-2 h-4 w-4' />
                다른 타입에 복사
              </Button>
            )}
            <Button
              onClick={() => setShowAddForm(true)}
              disabled={!selectedDateTypeId || isLoading}
            >
              <Plus className='mr-2 h-4 w-4' />
              교시 추가
            </Button>
          </div>
        </div>
      </Card>

      {/* 안내 메시지 */}
      {!selectedDateTypeId && (
        <Card className='p-8 text-center'>
          <Calendar className='text-text-muted mx-auto mb-4 h-12 w-12' />
          <p className='text-text-muted'>
            날짜 타입을 선택하면 해당 타입의 교시를 관리할 수 있습니다.
          </p>
        </Card>
      )}

      {/* 추가 폼 */}
      {showAddForm && selectedDateTypeId && (
        <Card className='border-primary/30 mb-6 border-2 p-4'>
          <h3 className='text-text mb-4 font-bold'>새 교시 추가</h3>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-5'>
            <div>
              <label className='text-text-muted mb-1 block text-sm'>교시 번호</label>
              <Input
                type='number'
                value={newPeriodNumber}
                onChange={(e) => setNewPeriodNumber(e.target.value)}
                placeholder='1'
                min={1}
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-sm'>교시명 (선택)</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder='1교시'
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-sm'>시작 시간</label>
              <Input
                type='time'
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-sm'>종료 시간</label>
              <Input
                type='time'
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
              />
            </div>
            <div className='flex items-end gap-2'>
              <Button onClick={handleAdd} disabled={isLoading}>
                <Check className='mr-1 h-4 w-4' />
                추가
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  setShowAddForm(false);
                  setNewPeriodNumber('');
                  setNewName('');
                  setNewStartTime('');
                  setNewEndTime('');
                }}
              >
                <X className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 교시 목록 - 날짜 타입별 */}
      {selectedDateTypeId ? (
        <Card className='p-4'>
          <div className='mb-4 flex items-center gap-2'>
            <Clock className='text-primary h-5 w-5' />
            <h2 className='text-text font-bold'>
              {dateTypes.find((dt) => dt.id === selectedDateTypeId)?.name || '교시 목록'}
            </h2>
            <span className='text-text-muted text-sm'>({filteredPeriods.length}개)</span>
          </div>

          {filteredPeriods.length === 0 ? (
            <p className='text-text-muted py-8 text-center'>
              등록된 교시가 없습니다. 교시를 추가해주세요.
            </p>
          ) : (
            <div className='space-y-2'>
              {filteredPeriods
                .sort((a, b) => a.period_number - b.period_number)
                .map((period) => (
                  <div
                    key={period.id}
                    className='flex items-center justify-between rounded-xl bg-gray-50 p-3'
                  >
                    {editingId === period.id ? (
                      // 수정 모드
                      <div className='grid flex-1 grid-cols-1 gap-3 md:grid-cols-5'>
                        <Input
                          type='number'
                          value={editPeriodNumber}
                          onChange={(e) => setEditPeriodNumber(e.target.value)}
                          placeholder='교시 번호'
                          min={1}
                        />
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder='교시명'
                        />
                        <Input
                          type='time'
                          value={editStartTime}
                          onChange={(e) => setEditStartTime(e.target.value)}
                        />
                        <Input
                          type='time'
                          value={editEndTime}
                          onChange={(e) => setEditEndTime(e.target.value)}
                        />
                        <div className='flex gap-2'>
                          <Button
                            size='sm'
                            onClick={() => handleSaveEdit(period.id)}
                            disabled={isLoading}
                          >
                            <Check className='h-4 w-4' />
                          </Button>
                          <Button size='sm' variant='outline' onClick={() => setEditingId(null)}>
                            <X className='h-4 w-4' />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // 보기 모드
                      <>
                        <div className='flex items-center gap-4'>
                          <div className='bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl'>
                            <span className='text-primary font-bold'>{period.period_number}</span>
                          </div>
                          <div>
                            <p className='text-text font-medium'>
                              {period.name || `${period.period_number}교시`}
                            </p>
                            <p className='text-text-muted text-sm'>
                              {formatTime(period.start_time)} ~ {formatTime(period.end_time)}
                            </p>
                          </div>
                        </div>
                        <div className='flex gap-2'>
                          <Button size='sm' variant='ghost' onClick={() => handleEdit(period)}>
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => handleDelete(period.id)}
                            disabled={isLoading}
                          >
                            <Trash2 className='text-error h-4 w-4' />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
            </div>
          )}
        </Card>
      ) : (
        // 전체 보기 - 날짜 타입별 그룹화
        dateTypes.length > 0 && (
          <div className='space-y-4'>
            {dateTypes.map((dateType) => {
              const typePeriods = groupedPeriods[dateType.id] || [];
              return (
                <Card key={dateType.id} className='p-4'>
                  <div className='mb-3 flex items-center gap-2'>
                    <div
                      className='h-3 w-3 rounded-full'
                      style={{ backgroundColor: dateType.color }}
                    />
                    <h3 className='text-text font-bold'>{dateType.name}</h3>
                    <span className='text-text-muted text-sm'>({typePeriods.length}개 교시)</span>
                    <button
                      className='text-primary ml-auto text-sm hover:underline'
                      onClick={() => handleDateTypeChange(dateType.id)}
                    >
                      상세 보기
                    </button>
                  </div>

                  {typePeriods.length > 0 ? (
                    <div className='flex flex-wrap gap-2'>
                      {typePeriods
                        .sort((a, b) => a.period_number - b.period_number)
                        .map((period) => (
                          <div key={period.id} className='rounded-lg bg-gray-100 px-3 py-1 text-sm'>
                            <span className='font-medium'>
                              {period.name || `${period.period_number}교시`}
                            </span>
                            <span className='text-text-muted ml-2'>
                              {formatTime(period.start_time)}~{formatTime(period.end_time)}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className='text-text-muted text-sm'>등록된 교시가 없습니다.</p>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* 복사 모달 */}
      {showCopyModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
          <Card className='mx-4 w-full max-w-md p-6'>
            <h3 className='mb-4 text-lg font-bold'>교시 복사</h3>
            <p className='text-text-muted mb-4'>
              현재 선택된 날짜 타입의 교시를 다른 지점/날짜 타입으로 복사합니다.
            </p>

            {/* 지점 선택 */}
            <div className='mb-4'>
              <label className='text-text mb-1 block text-sm font-medium'>복사할 대상 지점</label>
              <select
                value={copyTargetBranchId}
                onChange={(e) => void handleCopyTargetBranchChange(e.target.value)}
                className='focus:ring-primary/50 w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:outline-none'
              >
                <option value=''>선택하세요</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 날짜 타입 선택 */}
            <div className='mb-4'>
              <label className='text-text mb-1 block text-sm font-medium'>
                복사할 대상 날짜 타입
              </label>
              <select
                value={copyTargetDateTypeId}
                onChange={(e) => setCopyTargetDateTypeId(e.target.value)}
                className='focus:ring-primary/50 w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:outline-none'
                disabled={!copyTargetBranchId}
              >
                <option value=''>선택하세요</option>
                {copyTargetDateTypes
                  .filter(
                    (dt) =>
                      !(copyTargetBranchId === selectedBranchId && dt.id === selectedDateTypeId),
                  )
                  .map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name}
                    </option>
                  ))}
              </select>
              {copyTargetBranchId && copyTargetDateTypes.length === 0 && (
                <p className='text-text-muted mt-1 text-sm'>해당 지점에 날짜 타입이 없습니다.</p>
              )}
            </div>

            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => {
                  setShowCopyModal(false);
                  setCopyTargetBranchId('');
                  setCopyTargetDateTypeId('');
                }}
              >
                취소
              </Button>
              <Button
                onClick={handleCopy}
                disabled={!copyTargetBranchId || !copyTargetDateTypeId || isLoading}
              >
                복사
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
