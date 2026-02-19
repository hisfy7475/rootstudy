'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  givePoints, 
  getPointsOverview, 
  getAllPointsHistory,
  createRewardPreset,
  deleteRewardPreset,
  createPenaltyPreset,
  deletePenaltyPreset,
  getRewardPresets,
  getPenaltyPresets,
  deletePoint,
  deletePoints,
  type RewardPreset,
  type PenaltyPreset,
} from '@/lib/actions/admin';
import {
  Award,
  Plus,
  Minus,
  User,
  RefreshCw,
  Check,
  X,
  Settings,
  AlertTriangle,
  BookOpen,
  Trash2,
  Search,
  CheckSquare,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PointsOverview {
  id: string;
  seatNumber: number | null;
  name: string;
  reward: number;
  penalty: number;
  total: number;
}

interface PointsHistory {
  id: string;
  student_id: string;
  type: 'reward' | 'penalty';
  amount: number;
  reason: string;
  is_auto: boolean;
  created_at: string;
  studentName: string;
  studentSeatNumber: number | null;
  adminName: string;
}

interface Student {
  id: string;
  seatNumber: number | null;
  name: string;
}

interface PointsClientProps {
  initialOverview: PointsOverview[];
  initialHistory: PointsHistory[];
  students: Student[];
  branchId: string | null;
  initialRewardPresets: RewardPreset[];
  initialPenaltyPresets: PenaltyPreset[];
}

type FilterType = 'all' | 'reward' | 'penalty';
type TabType = 'overview' | 'history' | 'rules';

export function PointsClient({ 
  initialOverview, 
  initialHistory, 
  students,
  branchId,
  initialRewardPresets,
  initialPenaltyPresets,
}: PointsClientProps) {
  const [overview, setOverview] = useState<PointsOverview[]>(initialOverview);
  const [history, setHistory] = useState<PointsHistory[]>(initialHistory);
  const [filter, setFilter] = useState<FilterType>('all');
  const [studentFilter, setStudentFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // 다중 선택 관련 상태
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // 프리셋 상태
  const [rewardPresets, setRewardPresets] = useState<RewardPreset[]>(initialRewardPresets);
  const [penaltyPresets, setPenaltyPresets] = useState<PenaltyPreset[]>(initialPenaltyPresets);

  // 새 프리셋 입력
  const [newRewardAmount, setNewRewardAmount] = useState('');
  const [newRewardReason, setNewRewardReason] = useState('');
  const [newPenaltyAmount, setNewPenaltyAmount] = useState('');
  const [newPenaltyReason, setNewPenaltyReason] = useState('');

  // 부여 폼 상태
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [studentSearchText, setStudentSearchText] = useState<string>('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [pointType, setPointType] = useState<'reward' | 'penalty'>('reward');
  const [amount, setAmount] = useState<string>('1');
  const [reason, setReason] = useState<string>('');
  const [additionalNote, setAdditionalNote] = useState<string>('');

  const filteredHistory = history.filter(h => {
    const typeMatch = filter === 'all' || h.type === filter;
    const studentMatch = !studentFilter || h.student_id === studentFilter;
    return typeMatch && studentMatch;
  });

  const handleSubmit = async () => {
    if (!selectedStudent || !amount || !reason) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    const pointAmount = parseInt(amount);
    if (isNaN(pointAmount) || pointAmount < 1) {
      alert('올바른 점수를 입력해주세요.');
      return;
    }

    const finalReason = additionalNote.trim()
      ? `${reason} - ${additionalNote.trim()}`
      : reason;

    setLoading(true);
    try {
      const result = await givePoints(selectedStudent, pointType, pointAmount, finalReason);
      if (result.success) {
        showSuccess(`${pointType === 'reward' ? '상점' : '벌점'} ${pointAmount}점 부여 완료`);
        resetForm();
        await refreshData();
      }
    } catch (error) {
      console.error('Failed to give points:', error);
    } finally {
      setLoading(false);
    }
  };

  // 프리셋으로 빠른 부여
  const handleQuickGive = async (studentId: string, type: 'reward' | 'penalty', presetAmount: number, presetReason: string) => {
    if (presetAmount === 999) {
      alert('이 항목은 제적 사유입니다. 별도로 처리해주세요.');
      return;
    }
    
    setLoading(true);
    try {
      const result = await givePoints(studentId, type, presetAmount, presetReason);
      if (result.success) {
        showSuccess(`${type === 'reward' ? '상점' : '벌점'} ${presetAmount}점 부여 완료`);
        await refreshData();
      }
    } catch (error) {
      console.error('Failed to give points:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredStudentsForSearch = studentSearchText
    ? students.filter(s =>
        s.name.toLowerCase().includes(studentSearchText.toLowerCase()) ||
        String(s.seatNumber || '').includes(studentSearchText)
      )
    : students;

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudent(studentId);
    const student = students.find(s => s.id === studentId);
    setStudentSearchText(student ? `${student.seatNumber || '-'}번 ${student.name}` : '');
    setShowStudentDropdown(false);
  };

  const resetForm = () => {
    setShowAddForm(false);
    setSelectedStudent('');
    setStudentSearchText('');
    setShowStudentDropdown(false);
    setPointType('reward');
    setAmount('1');
    setReason('');
    setAdditionalNote('');
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      const [newOverview, newHistory] = await Promise.all([
        getPointsOverview(branchId),
        getAllPointsHistory(undefined, undefined, branchId), // 전체 내역 가져오기
      ]);
      setOverview(newOverview);
      setHistory(newHistory);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  // 상벌점 내역 삭제
  const handleDeletePoint = async (pointId: string) => {
    setLoading(true);
    try {
      const result = await deletePoint(pointId);
      if (result.success) {
        showSuccess('상벌점 내역이 삭제되었습니다. 점수가 원상복구됩니다.');
        setDeleteConfirmId(null);
        await refreshData();
      } else {
        alert(result.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete point:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 다중 선택 토글
  const toggleSelectPoint = (pointId: string) => {
    setSelectedPointIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pointId)) {
        newSet.delete(pointId);
      } else {
        newSet.add(pointId);
      }
      return newSet;
    });
  };

  // 전체 선택/해제
  const toggleSelectAll = () => {
    if (selectedPointIds.size === filteredHistory.length) {
      setSelectedPointIds(new Set());
    } else {
      setSelectedPointIds(new Set(filteredHistory.map(h => h.id)));
    }
  };

  // 선택 모드 종료
  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedPointIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  // 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedPointIds.size === 0) {
      alert('삭제할 내역을 선택해주세요.');
      return;
    }

    setLoading(true);
    try {
      const result = await deletePoints(Array.from(selectedPointIds));
      if (result.success) {
        showSuccess(`${result.deletedCount}건의 상벌점 내역이 삭제되었습니다.`);
        exitSelectMode();
        await refreshData();
      } else {
        alert(result.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete points:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  // 상점 프리셋 추가
  const handleAddRewardPreset = async () => {
    if (!branchId) {
      alert('지점 정보가 없습니다.');
      return;
    }
    const presetAmount = parseInt(newRewardAmount);
    if (isNaN(presetAmount) || presetAmount < 1) {
      alert('올바른 점수를 입력하세요.');
      return;
    }
    if (!newRewardReason.trim()) {
      alert('사유를 입력하세요.');
      return;
    }

    setLoading(true);
    const result = await createRewardPreset(branchId, presetAmount, newRewardReason.trim());
    if (result.success) {
      const presets = await getRewardPresets(branchId);
      setRewardPresets(presets);
      setNewRewardAmount('');
      setNewRewardReason('');
      showSuccess('상점 규정 추가 완료');
    } else {
      alert(result.error);
    }
    setLoading(false);
  };

  // 상점 프리셋 삭제
  const handleDeleteRewardPreset = async (id: string) => {
    setLoading(true);
    const result = await deleteRewardPreset(id);
    if (result.success && branchId) {
      const presets = await getRewardPresets(branchId);
      setRewardPresets(presets);
      showSuccess('상점 규정 삭제 완료');
    }
    setLoading(false);
  };

  // 벌점 프리셋 추가
  const handleAddPenaltyPreset = async () => {
    if (!branchId) {
      alert('지점 정보가 없습니다.');
      return;
    }
    const presetAmount = parseInt(newPenaltyAmount);
    if (isNaN(presetAmount) || presetAmount < 1) {
      alert('올바른 점수를 입력하세요.');
      return;
    }
    if (!newPenaltyReason.trim()) {
      alert('사유를 입력하세요.');
      return;
    }

    setLoading(true);
    const result = await createPenaltyPreset(branchId, presetAmount, newPenaltyReason.trim());
    if (result.success) {
      const presets = await getPenaltyPresets(branchId);
      setPenaltyPresets(presets);
      setNewPenaltyAmount('');
      setNewPenaltyReason('');
      showSuccess('벌점 규정 추가 완료');
    } else {
      alert(result.error);
    }
    setLoading(false);
  };

  // 벌점 프리셋 삭제
  const handleDeletePenaltyPreset = async (id: string) => {
    setLoading(true);
    const result = await deletePenaltyPreset(id);
    if (result.success && branchId) {
      const presets = await getPenaltyPresets(branchId);
      setPenaltyPresets(presets);
      showSuccess('벌점 규정 삭제 완료');
    }
    setLoading(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">상벌점 관리</h1>
          <p className="text-text-muted mt-1">학생들의 상점과 벌점을 관리하세요</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPresetManager(!showPresetManager)}>
            <Settings className="w-4 h-4 mr-2" />
            규정 관리
          </Button>
          <Button variant="outline" onClick={refreshData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            상벌점 부여
          </Button>
        </div>
      </div>

      {/* 성공 메시지 */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-100 text-green-800 px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-top z-50">
          <Check className="w-4 h-4" />
          {successMessage}
        </div>
      )}

      {/* 규정 관리 패널 */}
      {showPresetManager && (
        <Card className="p-4 bg-gray-50 border-2 border-dashed">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            상벌점 규정 관리
          </h3>
          
          <div className="grid grid-cols-2 gap-6">
            {/* 상점 규정 관리 */}
            <div>
              <p className="text-sm font-medium text-green-700 mb-2">상점 규정</p>
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {rewardPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between bg-white p-2 rounded-lg border"
                  >
                    <span className="text-sm">{preset.reason}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 font-semibold">+{preset.amount}점</span>
                      <button
                        onClick={() => handleDeleteRewardPreset(preset.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  placeholder="점수"
                  value={newRewardAmount}
                  onChange={(e) => setNewRewardAmount(e.target.value)}
                  className="w-20"
                />
                <Input
                  placeholder="규정 사유"
                  value={newRewardReason}
                  onChange={(e) => setNewRewardReason(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleAddRewardPreset} disabled={loading}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* 벌점 규정 관리 */}
            <div>
              <p className="text-sm font-medium text-red-700 mb-2">벌점 규정</p>
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {penaltyPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between bg-white p-2 rounded-lg border"
                  >
                    <span className="text-sm">{preset.reason}</span>
                    <div className="flex items-center gap-2">
                      {preset.amount === 999 ? (
                        <span className="text-gray-800 font-semibold text-xs">이유 불문 제적</span>
                      ) : (
                        <span className="text-red-500 font-semibold">-{preset.amount}점</span>
                      )}
                      <button
                        onClick={() => handleDeletePenaltyPreset(preset.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  placeholder="점수"
                  value={newPenaltyAmount}
                  onChange={(e) => setNewPenaltyAmount(e.target.value)}
                  className="w-20"
                />
                <Input
                  placeholder="규정 사유"
                  value={newPenaltyReason}
                  onChange={(e) => setNewPenaltyReason(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleAddPenaltyPreset} disabled={loading}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">* 제적 항목은 점수를 999로 입력하세요</p>
            </div>
          </div>
        </Card>
      )}

      {/* 탭 버튼 */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'overview' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('overview')}
        >
          <User className="w-4 h-4 mr-2" />
          학생별 현황
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('history')}
        >
          <Award className="w-4 h-4 mr-2" />
          상벌점 내역
        </Button>
        <Button
          variant={activeTab === 'rules' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('rules')}
        >
          <BookOpen className="w-4 h-4 mr-2" />
          상벌점 규정
        </Button>
      </div>

      {/* 상벌점 부여 폼 */}
      {showAddForm && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">상벌점 부여</h2>
            <button onClick={resetForm} className="text-text-muted hover:text-text">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 학생 검색 */}
            <div>
              <label className="block text-sm font-medium mb-2">학생</label>
              <div className="relative">
                <div className={cn(
                  'flex items-center border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/50',
                  selectedStudent && 'border-primary/50 bg-primary/5'
                )}>
                  <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                  <input
                    type="text"
                    value={studentSearchText}
                    onChange={(e) => {
                      setStudentSearchText(e.target.value);
                      setSelectedStudent('');
                      setShowStudentDropdown(true);
                    }}
                    onFocus={() => setShowStudentDropdown(true)}
                    onBlur={() => setTimeout(() => setShowStudentDropdown(false), 150)}
                    placeholder="이름 또는 좌석번호..."
                    className="flex-1 outline-none text-sm bg-transparent"
                  />
                  {studentSearchText && (
                    <button
                      type="button"
                      onClick={() => { setStudentSearchText(''); setSelectedStudent(''); }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {showStudentDropdown && (
                  <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto">
                    {filteredStudentsForSearch.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-500">검색 결과 없음</div>
                    ) : (
                      filteredStudentsForSearch.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectStudent(student.id)}
                          className={cn(
                            'w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors',
                            selectedStudent === student.id && 'bg-primary/10'
                          )}
                        >
                          <span className="font-semibold text-primary">{student.seatNumber || '-'}번</span>{' '}
                          {student.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 유형 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">유형</label>
              <div className="flex gap-2">
                <Button
                  variant={pointType === 'reward' ? 'default' : 'outline'}
                  className={cn(
                    'flex-1',
                    pointType === 'reward' && 'bg-green-600 hover:bg-green-700'
                  )}
                  onClick={() => {
                    setPointType('reward');
                    setReason('');
                    setAmount('1');
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  상점
                </Button>
                <Button
                  variant={pointType === 'penalty' ? 'default' : 'outline'}
                  className={cn(
                    'flex-1',
                    pointType === 'penalty' && 'bg-red-600 hover:bg-red-700'
                  )}
                  onClick={() => {
                    setPointType('penalty');
                    setReason('');
                    setAmount('1');
                  }}
                >
                  <Minus className="w-4 h-4 mr-1" />
                  벌점
                </Button>
              </div>
            </div>

            {/* 점수 */}
            <div>
              <label className="block text-sm font-medium mb-2">점수</label>
              <Input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="점수"
              />
            </div>

            {/* 사유 선택 */}
            <div>
              <label className="block text-sm font-medium mb-2">사유</label>
              <select
                value={reason}
                onChange={(e) => {
                  const selectedValue = e.target.value;
                  setReason(selectedValue);
                  setAdditionalNote('');
                  const presets = pointType === 'reward' ? rewardPresets : penaltyPresets;
                  const selectedPreset = presets.find(p => p.reason === selectedValue);
                  if (selectedPreset && selectedPreset.amount !== 999) {
                    setAmount(selectedPreset.amount.toString());
                  }
                }}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">사유를 선택하세요</option>
                {(pointType === 'reward' ? rewardPresets : penaltyPresets).map((preset) => (
                  <option key={preset.id} value={preset.reason}>
                    {preset.reason} ({preset.amount === 999 ? '제적' : `${preset.amount}점`})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 세부 내용 추가 입력 */}
          {reason && (
            <div className="mt-3">
              <label className="block text-sm font-medium mb-2">
                세부 내용
                <span className="text-gray-400 font-normal ml-1">(선택 사항)</span>
              </label>
              <Input
                value={additionalNote}
                onChange={(e) => setAdditionalNote(e.target.value)}
                placeholder={`예: ${reason}에 대한 구체적인 내용을 입력하세요`}
              />
              {additionalNote && (
                <p className="text-xs text-gray-500 mt-1">
                  최종 사유: <span className="font-medium text-gray-700">{reason} - {additionalNote}</span>
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={resetForm}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              부여하기
            </Button>
          </div>
        </Card>
      )}

      {/* 학생별 현황 탭 */}
      {activeTab === 'overview' && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            학생별 상벌점 현황
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">좌석</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">이름</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-green-600">상점</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-red-500">벌점</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-text-muted">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                      등록된 학생이 없습니다.
                    </td>
                  </tr>
                ) : (
                  overview.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-primary">{student.seatNumber || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <span>{student.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-green-600 font-medium">+{student.reward}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-red-500 font-medium">-{student.penalty}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'font-semibold',
                            student.total >= 0 ? 'text-green-600' : 'text-red-500'
                          )}
                        >
                          {student.total >= 0 ? '+' : ''}{student.total}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 상벌점 내역 탭 */}
      {activeTab === 'history' && (
        <Card className="p-6">
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">상벌점 내역</h2>
              <div className="flex gap-2">
                {!isSelectMode ? (
                  <>
                    {(['all', 'reward', 'penalty'] as FilterType[]).map((f) => (
                      <Button
                        key={f}
                        variant={filter === f ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilter(f)}
                      >
                        {f === 'all' ? '전체' : f === 'reward' ? '상점' : '벌점'}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSelectMode(true)}
                      className="ml-2"
                    >
                      <CheckSquare className="w-4 h-4 mr-1" />
                      선택
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectAll}
                      className={cn(
                        selectedPointIds.size > 0 && "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                      )}
                    >
                      {selectedPointIds.size === filteredHistory.length && filteredHistory.length > 0 ? (
                        <>
                          <CheckSquare className="w-4 h-4 mr-1" />
                          전체 해제
                        </>
                      ) : selectedPointIds.size > 0 ? (
                        <>
                          <CheckSquare className="w-4 h-4 mr-1" />
                          전체 선택
                        </>
                      ) : (
                        <>
                          <Square className="w-4 h-4 mr-1" />
                          전체 선택
                        </>
                      )}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      disabled={selectedPointIds.size === 0}
                      className="bg-red-500 hover:bg-red-600 border-red-500"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      선택 삭제 ({selectedPointIds.size})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={exitSelectMode}
                    >
                      취소
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            {/* 학생별 필터 */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-text-muted" />
                <span className="text-sm text-text-muted">학생 필터:</span>
              </div>
              <select
                value={studentFilter}
                onChange={(e) => setStudentFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">전체 학생</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.seatNumber || '-'}번 {student.name}
                  </option>
                ))}
              </select>
              {studentFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStudentFilter('')}
                  className="text-text-muted hover:text-text"
                >
                  <X className="w-4 h-4" />
                  초기화
                </Button>
              )}
              <span className="text-xs text-text-muted ml-auto">
                {filteredHistory.length}건
              </span>
            </div>
          </div>
          
          {/* 일괄 삭제 확인 모달 */}
          {showBulkDeleteConfirm && (
            <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded-xl">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-red-800">
                    {selectedPointIds.size}건의 상벌점 내역을 삭제하시겠습니까?
                  </p>
                  <p className="text-sm text-red-600 mt-1">
                    삭제된 내역의 점수는 모두 원상복구됩니다.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={loading}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    {loading ? '삭제 중...' : '삭제'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBulkDeleteConfirm(false)}
                  >
                    취소
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {filteredHistory.length === 0 ? (
              <p className="text-text-muted text-center py-8">내역이 없습니다.</p>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'p-4 rounded-xl border-l-4',
                    item.type === 'reward'
                      ? 'bg-green-50 border-green-500'
                      : 'bg-red-50 border-red-500',
                    isSelectMode && selectedPointIds.has(item.id) && 'ring-2 ring-primary ring-offset-1'
                  )}
                  onClick={isSelectMode ? () => toggleSelectPoint(item.id) : undefined}
                  style={isSelectMode ? { cursor: 'pointer' } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* 선택 모드 체크박스 */}
                      {isSelectMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectPoint(item.id);
                          }}
                          className="flex-shrink-0"
                        >
                          {selectedPointIds.has(item.id) ? (
                            <CheckSquare className="w-5 h-5 text-primary" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      )}
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center',
                          item.type === 'reward' ? 'bg-green-100' : 'bg-red-100'
                        )}
                      >
                        {item.type === 'reward' ? (
                          <Plus className="w-4 h-4 text-green-600" />
                        ) : (
                          <Minus className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {item.studentSeatNumber || '-'}번 {item.studentName}
                          </span>
                          <span
                            className={cn(
                              'text-sm font-semibold',
                              item.type === 'reward' ? 'text-green-600' : 'text-red-500'
                            )}
                          >
                            {item.type === 'reward' ? '+' : '-'}{item.amount}점
                          </span>
                          {item.is_auto && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                              자동
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-text-muted">{item.reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm text-text-muted">{formatDate(item.created_at)}</p>
                        <p className="text-xs text-text-muted">by {item.adminName}</p>
                      </div>
                      
                      {/* 삭제 버튼 (선택 모드가 아닐 때만) */}
                      {!isSelectMode && (
                        deleteConfirmId === item.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeletePoint(item.id)}
                              disabled={loading}
                              className="text-xs"
                            >
                              삭제
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-xs"
                            >
                              취소
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="삭제 (점수 원상복구)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* 상벌점 규정 탭 */}
      {activeTab === 'rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 상점 규정 */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-green-700">상점 규정</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-green-50 border-b border-green-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-green-700">상점 규정</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-green-700 w-24">상점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-50">
                  {rewardPresets.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-text-muted">
                        등록된 상점 규정이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    rewardPresets.map((preset) => (
                      <tr key={preset.id} className="hover:bg-green-50/50">
                        <td className="px-4 py-3">{preset.reason}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-green-600 font-semibold">{preset.amount}점</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 벌점 규정 */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-red-700">벌점 규정</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-red-50 border-b border-red-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-red-700">벌점 규정</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-red-700 w-32">벌점</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {penaltyPresets.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-text-muted">
                        등록된 벌점 규정이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    penaltyPresets.map((preset) => (
                      <tr key={preset.id} className="hover:bg-red-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {preset.amount === 999 && (
                              <AlertTriangle className="w-4 h-4 text-gray-700" />
                            )}
                            {preset.reason}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {preset.amount === 999 ? (
                            <span className="text-gray-800 font-semibold text-sm">이유 불문 제적</span>
                          ) : (
                            <span className="text-red-500 font-semibold">{preset.amount}점</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-4 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              해당 항목은 사유에 따라 벌점의 부과 여부가 결정됩니다.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
