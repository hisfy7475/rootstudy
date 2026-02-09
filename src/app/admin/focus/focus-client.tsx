'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  recordFocusScoreBatch, 
  givePointsBatch, 
  getAllStudents, 
  getWeeklyFocusReport,
  createPenaltyPreset,
  deletePenaltyPreset,
  getPenaltyPresets,
  createFocusScorePreset,
  deleteFocusScorePreset,
  getFocusScorePresets,
  type PenaltyPreset,
  type FocusScorePreset,
} from '@/lib/actions/admin';
import {
  Brain,
  User,
  Check,
  RefreshCw,
  Download,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Student {
  id: string;
  seatNumber: number | null;
  name: string;
  status: 'checked_in' | 'checked_out' | 'on_break';
  currentSubject: string | null;
  avgFocus: number | null;
  todayReward: number;
  todayPenalty: number;
}

interface FocusReport {
  id: string;
  seatNumber: number | null;
  name: string;
  dailyScores: { [key: string]: number[] };
  weeklyAvg: number | null;
  totalRecords: number;
}

interface Period {
  id: string;
  period_number: number;
  name: string | null;
  start_time: string;
  end_time: string;
}

interface FocusClientProps {
  initialStudents: Student[];
  initialReport: FocusReport[];
  todayPeriods: Period[];
  dateTypeName: string | null;
  todayDate: string;
  branchId: string | null;
  initialPenaltyPresets: PenaltyPreset[];
  initialFocusPresets: FocusScorePreset[];
}

// 기본 벌점 프리셋 (DB에 없을 때 사용)
const defaultPenaltyPresets = [
  { amount: 1, reason: '졸음/집중력 저하', color: 'bg-red-400' },
  { amount: 2, reason: '휴대폰 사용', color: 'bg-red-500' },
  { amount: 3, reason: '무단 이탈', color: 'bg-red-600' },
];

// 기본 몰입도 프리셋 (DB에 없을 때 사용)
const defaultFocusPresets = [
  { score: 8, label: '인강', color: 'bg-blue-500' },
  { score: 5, label: '수면', color: 'bg-amber-500' },
  { score: 7, label: '라운지', color: 'bg-blue-400' },
  { score: 10, label: '클리닉/멘토링', color: 'bg-emerald-600' },
];

// 현재 시간 기준 교시 찾기
function findCurrentPeriod(periods: Period[]): Period | null {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  
  for (const period of periods) {
    const startTime = period.start_time.slice(0, 5);
    const endTime = period.end_time.slice(0, 5);
    
    if (currentTime >= startTime && currentTime <= endTime) {
      return period;
    }
  }
  return null;
}

// 시간 포맷팅
function formatTime(time: string): string {
  return time.slice(0, 5);
}

// 날짜 포맷팅
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = days[date.getDay()];
  return `${month}월 ${day}일 (${dayOfWeek})`;
}

export function FocusClient({ 
  initialStudents, 
  initialReport, 
  todayPeriods, 
  dateTypeName, 
  todayDate,
  branchId,
  initialPenaltyPresets,
  initialFocusPresets,
}: FocusClientProps) {
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [report, setReport] = useState<FocusReport[]>(initialReport);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  
  // 벌점 프리셋 상태
  const [penaltyPresets, setPenaltyPresets] = useState<PenaltyPreset[]>(initialPenaltyPresets);
  
  // 몰입도 프리셋 상태
  const [focusPresets, setFocusPresets] = useState<FocusScorePreset[]>(initialFocusPresets);
  
  // 새 벌점 프리셋 입력
  const [newPenaltyAmount, setNewPenaltyAmount] = useState('');
  const [newPenaltyReason, setNewPenaltyReason] = useState('');
  
  // 새 몰입도 프리셋 입력
  const [newFocusScore, setNewFocusScore] = useState('');
  const [newFocusLabel, setNewFocusLabel] = useState('');

  // 커스텀 벌점
  const [customPenaltyReason, setCustomPenaltyReason] = useState('');
  const [customPenaltyAmount, setCustomPenaltyAmount] = useState('1');

  // 현재 교시 자동 선택
  const currentPeriod = useMemo(() => findCurrentPeriod(todayPeriods), [todayPeriods]);
  
  useEffect(() => {
    if (currentPeriod && !selectedPeriodId) {
      setSelectedPeriodId(currentPeriod.id);
    }
  }, [currentPeriod, selectedPeriodId]);

  const selectedPeriod = todayPeriods.find(p => p.id === selectedPeriodId);

  // 입실 중인 학생만 필터링
  const checkedInStudents = students.filter(s => s.status === 'checked_in');

  // 사용할 벌점 프리셋 (DB에 있으면 DB것, 없으면 기본값)
  // 영구퇴실 사유(amount >= 999)는 빠른 벌점에서 제외
  const activePenaltyPresets = penaltyPresets.length > 0 
    ? penaltyPresets.filter(p => p.amount < 999)
    : defaultPenaltyPresets.map((p, i) => ({ ...p, id: `default-${i}`, branch_id: '', sort_order: i, is_active: true }));

  // 사용할 몰입도 프리셋 (DB에 있으면 DB것, 없으면 기본값)
  const activeFocusPresets = focusPresets.length > 0 
    ? focusPresets
    : defaultFocusPresets.map((p, i) => ({ ...p, id: `default-${i}`, branch_id: '', sort_order: i, is_active: true }));

  // 전체 선택/해제
  const handleSelectAll = () => {
    if (selectedStudents.size === checkedInStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(checkedInStudents.map(s => s.id)));
    }
  };

  // 개별 선택/해제
  const handleSelectStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  // 몰입도 일괄 입력
  const handleBatchFocusScore = async (score: number, activityNote?: string) => {
    if (selectedStudents.size === 0) {
      alert('학생을 선택해주세요.');
      return;
    }
    if (!selectedPeriodId) {
      alert('교시를 선택해주세요.');
      return;
    }

    setLoading(true);
    try {
      const result = await recordFocusScoreBatch(
        Array.from(selectedStudents),
        score,
        selectedPeriodId,
        activityNote
      );
      if (result.success) {
        const periodName = selectedPeriod?.name || `${selectedPeriod?.period_number}교시`;
        const activityText = activityNote ? ` (${activityNote})` : '';
        showSuccess(`${result.count}명에게 ${periodName} ${score}점${activityText} 기록 완료`);
        setSelectedStudents(new Set());
        await refreshData();
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Failed to record batch score:', error);
    } finally {
      setLoading(false);
    }
  };

  // 벌점 일괄 부여
  const handleBatchPenalty = async (amount: number, reason: string) => {
    if (selectedStudents.size === 0) {
      alert('학생을 선택해주세요.');
      return;
    }

    setLoading(true);
    try {
      const result = await givePointsBatch(
        Array.from(selectedStudents),
        'penalty',
        amount,
        reason
      );
      if (result.success) {
        showSuccess(`${result.count}명에게 벌점 ${amount}점 부여 완료`);
        setSelectedStudents(new Set());
        setCustomPenaltyReason('');
        await refreshData();
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Failed to give batch penalty:', error);
    } finally {
      setLoading(false);
    }
  };

  // 커스텀 벌점 부여
  const handleCustomPenalty = () => {
    if (!customPenaltyReason.trim()) {
      alert('벌점 사유를 입력해주세요.');
      return;
    }
    const amount = parseInt(customPenaltyAmount);
    if (isNaN(amount) || amount < 1) {
      alert('올바른 벌점 점수를 입력해주세요.');
      return;
    }
    handleBatchPenalty(amount, customPenaltyReason.trim());
  };

  // 벌점 프리셋 추가
  const handleAddPenaltyPreset = async () => {
    if (!branchId) {
      alert('지점 정보가 없습니다.');
      return;
    }
    const amount = parseInt(newPenaltyAmount);
    if (isNaN(amount) || amount < 1) {
      alert('올바른 점수를 입력하세요.');
      return;
    }
    if (!newPenaltyReason.trim()) {
      alert('사유를 입력하세요.');
      return;
    }

    setLoading(true);
    const result = await createPenaltyPreset(branchId, amount, newPenaltyReason.trim());
    if (result.success) {
      const presets = await getPenaltyPresets(branchId);
      setPenaltyPresets(presets);
      setNewPenaltyAmount('');
      setNewPenaltyReason('');
      showSuccess('벌점 프리셋 추가 완료');
    } else {
      alert(result.error);
    }
    setLoading(false);
  };

  // 벌점 프리셋 삭제
  const handleDeletePenaltyPreset = async (id: string) => {
    if (id.startsWith('default-')) return; // 기본 프리셋은 삭제 불가
    
    setLoading(true);
    const result = await deletePenaltyPreset(id);
    if (result.success && branchId) {
      const presets = await getPenaltyPresets(branchId);
      setPenaltyPresets(presets);
      showSuccess('프리셋 삭제 완료');
    }
    setLoading(false);
  };

  // 몰입도 프리셋 추가
  const handleAddFocusPreset = async () => {
    if (!branchId) {
      alert('지점 정보가 없습니다.');
      return;
    }
    const score = parseInt(newFocusScore);
    if (isNaN(score) || score < 1 || score > 10) {
      alert('점수는 1~10 사이로 입력하세요.');
      return;
    }
    if (!newFocusLabel.trim()) {
      alert('라벨을 입력하세요.');
      return;
    }

    setLoading(true);
    const result = await createFocusScorePreset(branchId, score, newFocusLabel.trim());
    if (result.success) {
      const presets = await getFocusScorePresets(branchId);
      setFocusPresets(presets);
      setNewFocusScore('');
      setNewFocusLabel('');
      showSuccess('몰입도 프리셋 추가 완료');
    } else {
      alert(result.error);
    }
    setLoading(false);
  };

  // 몰입도 프리셋 삭제
  const handleDeleteFocusPreset = async (id: string) => {
    if (id.startsWith('default-')) return; // 기본 프리셋은 삭제 불가
    
    setLoading(true);
    const result = await deleteFocusScorePreset(id);
    if (result.success && branchId) {
      const presets = await getFocusScorePresets(branchId);
      setFocusPresets(presets);
      showSuccess('프리셋 삭제 완료');
    }
    setLoading(false);
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const refreshData = async () => {
    const [newStudents, newReport] = await Promise.all([
      getAllStudents('checked_in'),
      getWeeklyFocusReport(),
    ]);
    setStudents(newStudents);
    setReport(newReport);
  };

  // 주간 날짜 헤더 생성
  const today = new Date();
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return {
      date: date.toISOString().split('T')[0],
      label: ['일', '월', '화', '수', '목', '금', '토'][i],
      isToday: date.toISOString().split('T')[0] === today.toISOString().split('T')[0],
    };
  });

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">몰입도 관리</h1>
          <p className="text-text-muted mt-1">학생들의 학습 몰입도를 기록하세요</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowPresetManager(!showPresetManager)}
          >
            <Settings className="w-4 h-4 mr-2" />
            프리셋 관리
          </Button>
          <Button variant="outline" onClick={refreshData} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
            새로고침
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

      {/* 프리셋 관리 패널 */}
      {showPresetManager && (
        <Card className="p-4 bg-gray-50 border-2 border-dashed space-y-6">
          {/* 몰입도 프리셋 관리 */}
          <div>
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-blue-700">
              <Brain className="w-4 h-4" />
              몰입도 프리셋 관리
            </h3>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {activeFocusPresets.map((preset) => (
                <span
                  key={preset.id}
                  className={cn(
                    'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-white',
                    preset.color || 'bg-blue-500'
                  )}
                >
                  {preset.label} ({preset.score}점)
                  {!preset.id.startsWith('default-') && (
                    <button
                      onClick={() => handleDeleteFocusPreset(preset.id)}
                      className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex gap-2 max-w-md">
              <Input
                type="number"
                min="1"
                max="10"
                placeholder="점수"
                value={newFocusScore}
                onChange={(e) => setNewFocusScore(e.target.value)}
                className="w-20"
              />
              <Input
                placeholder="라벨 (예: 인강)"
                value={newFocusLabel}
                onChange={(e) => setNewFocusLabel(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddFocusPreset} disabled={loading}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* 벌점 프리셋 관리 */}
          <div>
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-red-700">
              <Settings className="w-4 h-4" />
              벌점 프리셋 관리
            </h3>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {activePenaltyPresets.map((preset) => (
                <span
                  key={preset.id}
                  className={cn(
                    'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-white',
                    preset.color || 'bg-red-500'
                  )}
                >
                  {preset.reason} (-{preset.amount}점)
                  {!preset.id.startsWith('default-') && (
                    <button
                      onClick={() => handleDeletePenaltyPreset(preset.id)}
                      className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex gap-2 max-w-md">
              <Input
                type="number"
                min="1"
                placeholder="점수"
                value={newPenaltyAmount}
                onChange={(e) => setNewPenaltyAmount(e.target.value)}
                className="w-20"
              />
              <Input
                placeholder="사유 (예: 지각)"
                value={newPenaltyReason}
                onChange={(e) => setNewPenaltyReason(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddPenaltyPreset} disabled={loading}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 교시 선택 */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <span className="font-medium">{formatDate(todayDate)}</span>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-sm",
                dateTypeName ? "bg-primary/10 text-primary" : "bg-yellow-100 text-yellow-700"
              )}>
                {dateTypeName || '날짜 타입 미지정'}
              </span>
            </div>
            
            {todayPeriods.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-text-muted">교시:</span>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">선택하세요</option>
                  {todayPeriods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name || `${period.period_number}교시`} ({formatTime(period.start_time)}~{formatTime(period.end_time)})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">날짜 타입 미지정</span>
              </div>
            )}
          </div>

          {currentPeriod && (
            <div className="text-sm text-text-muted">
              현재: <span className="font-medium text-primary">{currentPeriod.name || `${currentPeriod.period_number}교시`}</span>
            </div>
          )}
        </div>
      </Card>

      {/* 점수/벌점 입력 영역 */}
      <Card className="p-4">
        <div className="space-y-4">
          {/* 선택된 학생 수 표시 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-secondary" />
              <span className="font-semibold">점수/벌점 입력</span>
              {selectedStudents.size > 0 && (
                <span className="px-2 py-0.5 bg-primary text-white rounded-full text-sm font-medium">
                  {selectedStudents.size}명 선택됨
                </span>
              )}
            </div>
            {selectedPeriod && (
              <span className="text-sm text-text-muted">
                {selectedPeriod.name || `${selectedPeriod.period_number}교시`}
              </span>
            )}
          </div>

          {/* 경고 메시지 */}
          {selectedStudents.size === 0 && (
            <div className="p-2 bg-gray-100 rounded-lg text-center text-sm text-gray-500">
              아래 테이블에서 학생을 선택해주세요
            </div>
          )}

          {/* 몰입도 퀵버튼 */}
          <div>
            <p className="text-xs text-gray-500 mb-2">빠른 몰입도 입력</p>
            <div className="flex flex-wrap gap-2">
              {activeFocusPresets.map((preset) => (
                <button
                  key={preset.id}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm',
                    'hover:opacity-90 active:scale-95 transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    preset.color || (preset.score >= 9 ? 'bg-emerald-600' : preset.score >= 7 ? 'bg-blue-500' : 'bg-amber-500')
                  )}
                  onClick={() => handleBatchFocusScore(preset.score, preset.label)}
                  disabled={loading || selectedStudents.size === 0 || !selectedPeriodId}
                >
                  {preset.label} ({preset.score}점)
                </button>
              ))}
            </div>
          </div>

          {/* 몰입도 점수 버튼 (6~10) */}
          <div>
            <p className="text-xs text-gray-500 mb-2">몰입도 점수</p>
            <div className="flex gap-1">
              {[6, 7, 8, 9, 10].map((score) => (
                <button
                  key={score}
                  className={cn(
                    'w-10 h-10 rounded-lg text-sm font-bold shadow-sm',
                    'hover:opacity-90 active:scale-95 transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    score >= 9 ? 'bg-emerald-600 text-white' :
                    score >= 7 ? 'bg-blue-500 text-white' :
                    'bg-amber-500 text-white'
                  )}
                  onClick={() => handleBatchFocusScore(score)}
                  disabled={loading || selectedStudents.size === 0 || !selectedPeriodId}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>

          {/* 벌점 버튼 */}
          <div>
            <p className="text-xs text-gray-500 mb-2">빠른 벌점</p>
            <div className="flex flex-wrap gap-2">
              {activePenaltyPresets.map((preset) => (
                <button
                  key={preset.id}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm',
                    'hover:opacity-90 active:scale-95 transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    preset.color || 'bg-red-500'
                  )}
                  onClick={() => handleBatchPenalty(preset.amount, preset.reason)}
                  disabled={loading || selectedStudents.size === 0}
                >
                  {preset.reason} (-{preset.amount})
                </button>
              ))}
            </div>
          </div>

          {/* 커스텀 벌점 */}
          <div>
            <p className="text-xs text-gray-500 mb-2">직접 입력</p>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                max="10"
                value={customPenaltyAmount}
                onChange={(e) => setCustomPenaltyAmount(e.target.value)}
                className="w-16 h-9"
                placeholder="점수"
              />
              <Input
                value={customPenaltyReason}
                onChange={(e) => setCustomPenaltyReason(e.target.value)}
                className="flex-1 h-9"
                placeholder="벌점 사유 입력..."
              />
              <Button
                size="sm"
                variant="danger"
                onClick={handleCustomPenalty}
                disabled={loading || selectedStudents.size === 0}
                className="h-9"
              >
                벌점 부여
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 입실 중인 학생 테이블 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            입실 중인 학생 ({checkedInStudents.length}명)
          </h2>
        </div>

        {checkedInStudents.length === 0 ? (
          <p className="text-text-muted text-center py-8">현재 입실 중인 학생이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedStudents.size === checkedInStudents.length && checkedInStudents.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">번호</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">이름</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">현재 과목</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">오늘 몰입도</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">오늘 상/벌점</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {checkedInStudents.map((student) => (
                  <tr 
                    key={student.id}
                    className={cn(
                      'hover:bg-gray-50 cursor-pointer',
                      selectedStudents.has(student.id) && 'bg-primary/5'
                    )}
                    onClick={() => handleSelectStudent(student.id)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedStudents.has(student.id)}
                        onChange={() => handleSelectStudent(student.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary">{student.seatNumber || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{student.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-text-muted">{student.currentSubject || '미설정'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {student.avgFocus !== null ? (
                        <span className={cn(
                          'font-semibold',
                          student.avgFocus >= 8 ? 'text-green-600' :
                          student.avgFocus >= 6 ? 'text-primary' :
                          student.avgFocus >= 4 ? 'text-amber-600' : 'text-red-500'
                        )}>
                          {student.avgFocus}점
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {student.todayReward > 0 && (
                          <span className="text-green-600 font-semibold">+{student.todayReward}</span>
                        )}
                        {student.todayPenalty > 0 && (
                          <span className="text-red-500 font-semibold">-{student.todayPenalty}</span>
                        )}
                        {student.todayReward === 0 && student.todayPenalty === 0 && (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 주간 몰입도 리포트 (접기/펼치기) */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-lg font-semibold"
            onClick={() => setShowReport(!showReport)}
          >
            <Brain className="w-5 h-5 text-secondary" />
            주간 몰입도 리포트
            {showReport ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            엑셀 다운로드
          </Button>
        </div>

        {showReport && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">학생</th>
                  {weekDays.map((day) => (
                    <th
                      key={day.date}
                      className={cn(
                        'px-4 py-3 text-center text-sm font-medium',
                        day.isToday ? 'text-primary bg-primary/5' : 'text-text-muted'
                      )}
                    >
                      {day.label}
                      <br />
                      <span className="text-xs">{day.date.slice(5)}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-sm font-medium text-text-muted">평균</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-text-muted">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  report.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-primary font-medium">
                            {student.seatNumber || '-'}
                          </span>
                          <span>{student.name}</span>
                        </div>
                      </td>
                      {weekDays.map((day) => {
                        const scores = student.dailyScores[day.date] || [];
                        const avg = scores.length > 0
                          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
                          : null;

                        return (
                          <td
                            key={day.date}
                            className={cn(
                              'px-4 py-3 text-center',
                              day.isToday && 'bg-primary/5'
                            )}
                          >
                            {avg !== null ? (
                              <span
                                className={cn(
                                  'font-medium',
                                  avg >= 8 ? 'text-green-600' :
                                  avg >= 6 ? 'text-primary' :
                                  avg >= 4 ? 'text-yellow-600' : 'text-red-500'
                                )}
                              >
                                {avg}
                              </span>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center">
                        {student.weeklyAvg !== null ? (
                          <span className="font-semibold text-primary">{student.weeklyAvg}</span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
