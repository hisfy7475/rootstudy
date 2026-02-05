'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Clock, 
  Plus, 
  Pencil, 
  Trash2, 
  Copy,
  X,
  Check,
  Calendar
} from 'lucide-react';
import { 
  getPeriodDefinitions,
  createPeriodDefinition, 
  updatePeriodDefinition, 
  deletePeriodDefinition,
  copyPeriodsToDateType
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
}

export default function PeriodsClient({ 
  branches, 
  initialDateTypes, 
  initialPeriods 
}: PeriodsClientProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
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

  // 지점 변경 시 데이터 새로고침
  useEffect(() => {
    if (selectedBranchId) {
      loadData();
    }
  }, [selectedBranchId]);

  // 날짜 타입 변경 시 교시 목록 필터링
  useEffect(() => {
    if (selectedBranchId) {
      loadPeriods();
    }
  }, [selectedDateTypeId]);

  // 복사 모달에서 지점 변경 시 해당 지점의 날짜 타입 불러오기
  useEffect(() => {
    const loadCopyTargetDateTypes = async () => {
      if (copyTargetBranchId) {
        const types = await getDateTypeDefinitions(copyTargetBranchId);
        setCopyTargetDateTypes(types);
        setCopyTargetDateTypeId('');
      } else {
        setCopyTargetDateTypes([]);
        setCopyTargetDateTypeId('');
      }
    };
    loadCopyTargetDateTypes();
  }, [copyTargetBranchId]);

  const loadData = async () => {
    setIsLoading(true);
    const [newDateTypes, newPeriods] = await Promise.all([
      getDateTypeDefinitions(selectedBranchId),
      getPeriodDefinitions(selectedBranchId, selectedDateTypeId || undefined),
    ]);
    setDateTypes(newDateTypes);
    setPeriods(newPeriods);
    setIsLoading(false);
  };

  const loadPeriods = async () => {
    const newPeriods = await getPeriodDefinitions(
      selectedBranchId, 
      selectedDateTypeId || undefined
    );
    setPeriods(newPeriods);
  };

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
      newName || undefined
    );

    if (result.success) {
      await loadPeriods();
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
      await loadPeriods();
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
      setPeriods(periods.filter(p => p.id !== id));
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
      copyTargetDateTypeId
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
    ? periods.filter(p => p.date_type_id === selectedDateTypeId)
    : periods;

  // 날짜 타입별로 그룹화
  const groupedPeriods = periods.reduce((acc, period) => {
    const dateTypeId = period.date_type_id;
    if (!acc[dateTypeId]) {
      acc[dateTypeId] = [];
    }
    acc[dateTypeId].push(period);
    return acc;
  }, {} as Record<string, PeriodDefinition[]>);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text mb-2">교시 관리</h1>
        <p className="text-text-muted">날짜 타입별 시간표(교시)를 설정합니다.</p>
      </div>

      {/* 필터 */}
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          {/* 지점 선택 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-text mb-1">지점</label>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setSelectedDateTypeId('');
              }}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          {/* 날짜 타입 선택 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-text mb-1">날짜 타입</label>
            <select
              value={selectedDateTypeId}
              onChange={(e) => setSelectedDateTypeId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">전체 보기</option>
              {dateTypes.map(dt => (
                <option key={dt.id} value={dt.id}>
                  {dt.name}
                </option>
              ))}
            </select>
          </div>

          {/* 버튼들 */}
          <div className="flex gap-2">
            {selectedDateTypeId && filteredPeriods.length > 0 && (
              <Button 
                variant="outline" 
                onClick={() => setShowCopyModal(true)}
                disabled={isLoading}
              >
                <Copy className="w-4 h-4 mr-2" />
                다른 타입에 복사
              </Button>
            )}
            <Button 
              onClick={() => setShowAddForm(true)}
              disabled={!selectedDateTypeId || isLoading}
            >
              <Plus className="w-4 h-4 mr-2" />
              교시 추가
            </Button>
          </div>
        </div>
      </Card>

      {/* 안내 메시지 */}
      {!selectedDateTypeId && (
        <Card className="p-8 text-center">
          <Calendar className="w-12 h-12 mx-auto mb-4 text-text-muted" />
          <p className="text-text-muted">
            날짜 타입을 선택하면 해당 타입의 교시를 관리할 수 있습니다.
          </p>
        </Card>
      )}

      {/* 추가 폼 */}
      {showAddForm && selectedDateTypeId && (
        <Card className="p-4 mb-6 border-2 border-primary/30">
          <h3 className="font-bold text-text mb-4">새 교시 추가</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">교시 번호</label>
              <Input
                type="number"
                value={newPeriodNumber}
                onChange={(e) => setNewPeriodNumber(e.target.value)}
                placeholder="1"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">교시명 (선택)</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="1교시"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">시작 시간</label>
              <Input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">종료 시간</label>
              <Input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleAdd} disabled={isLoading}>
                <Check className="w-4 h-4 mr-1" />
                추가
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowAddForm(false);
                  setNewPeriodNumber('');
                  setNewName('');
                  setNewStartTime('');
                  setNewEndTime('');
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 교시 목록 - 날짜 타입별 */}
      {selectedDateTypeId ? (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-text">
              {dateTypes.find(dt => dt.id === selectedDateTypeId)?.name || '교시 목록'}
            </h2>
            <span className="text-sm text-text-muted">
              ({filteredPeriods.length}개)
            </span>
          </div>

          {filteredPeriods.length === 0 ? (
            <p className="text-text-muted text-center py-8">
              등록된 교시가 없습니다. 교시를 추가해주세요.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredPeriods
                .sort((a, b) => a.period_number - b.period_number)
                .map(period => (
                  <div 
                    key={period.id} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    {editingId === period.id ? (
                      // 수정 모드
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                        <Input
                          type="number"
                          value={editPeriodNumber}
                          onChange={(e) => setEditPeriodNumber(e.target.value)}
                          placeholder="교시 번호"
                          min={1}
                        />
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="교시명"
                        />
                        <Input
                          type="time"
                          value={editStartTime}
                          onChange={(e) => setEditStartTime(e.target.value)}
                        />
                        <Input
                          type="time"
                          value={editEndTime}
                          onChange={(e) => setEditEndTime(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleSaveEdit(period.id)}
                            disabled={isLoading}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // 보기 모드
                      <>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <span className="font-bold text-primary">
                              {period.period_number}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-text">
                              {period.name || `${period.period_number}교시`}
                            </p>
                            <p className="text-sm text-text-muted">
                              {formatTime(period.start_time)} ~ {formatTime(period.end_time)}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleEdit(period)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleDelete(period.id)}
                            disabled={isLoading}
                          >
                            <Trash2 className="w-4 h-4 text-error" />
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
          <div className="space-y-4">
            {dateTypes.map(dateType => {
              const typePeriods = groupedPeriods[dateType.id] || [];
              return (
                <Card key={dateType.id} className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: dateType.color }}
                    />
                    <h3 className="font-bold text-text">{dateType.name}</h3>
                    <span className="text-sm text-text-muted">
                      ({typePeriods.length}개 교시)
                    </span>
                    <button
                      className="ml-auto text-sm text-primary hover:underline"
                      onClick={() => setSelectedDateTypeId(dateType.id)}
                    >
                      상세 보기
                    </button>
                  </div>
                  
                  {typePeriods.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {typePeriods
                        .sort((a, b) => a.period_number - b.period_number)
                        .map(period => (
                          <div 
                            key={period.id}
                            className="px-3 py-1 bg-gray-100 rounded-lg text-sm"
                          >
                            <span className="font-medium">
                              {period.name || `${period.period_number}교시`}
                            </span>
                            <span className="text-text-muted ml-2">
                              {formatTime(period.start_time)}~{formatTime(period.end_time)}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted">
                      등록된 교시가 없습니다.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* 복사 모달 */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 w-full max-w-md mx-4">
            <h3 className="font-bold text-lg mb-4">교시 복사</h3>
            <p className="text-text-muted mb-4">
              현재 선택된 날짜 타입의 교시를 다른 지점/날짜 타입으로 복사합니다.
            </p>
            
            {/* 지점 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-text mb-1">
                복사할 대상 지점
              </label>
              <select
                value={copyTargetBranchId}
                onChange={(e) => setCopyTargetBranchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">선택하세요</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 날짜 타입 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-text mb-1">
                복사할 대상 날짜 타입
              </label>
              <select
                value={copyTargetDateTypeId}
                onChange={(e) => setCopyTargetDateTypeId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={!copyTargetBranchId}
              >
                <option value="">선택하세요</option>
                {copyTargetDateTypes
                  .filter(dt => !(copyTargetBranchId === selectedBranchId && dt.id === selectedDateTypeId))
                  .map(dt => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name}
                    </option>
                  ))}
              </select>
              {copyTargetBranchId && copyTargetDateTypes.length === 0 && (
                <p className="text-sm text-text-muted mt-1">
                  해당 지점에 날짜 타입이 없습니다.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
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
