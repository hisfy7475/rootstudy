'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  recordFocusScoreIndividual,
  deleteFocusScore,
  getTodayFocusScoresByPeriod,
  givePointsBatch, 
  getAllStudents, 
  getWeeklyFocusReport,
  createPenaltyPreset,
  deletePenaltyPreset,
  getPenaltyPresets,
  createFocusScorePreset,
  deleteFocusScorePreset,
  getFocusScorePresets,
  updateFocusScorePreset,
  setStudentSubject,
  getPhoneSubmissions,
  setPhoneSubmission,
  clearPhoneSubmissionsForDate,
  getStudentsPresentDuringPeriod,
  type PenaltyPreset,
  type FocusScorePreset,
  type PhoneSubmissionStatus,
  type PhoneSubmissionMap,
} from '@/lib/actions/admin';
import { getTodayPeriods } from '@/lib/actions/period';
import { getSubjectsForStudent } from '@/lib/actions/student-type';
import { createClient } from '@/lib/supabase/client';
import {
  Brain,
  User,
  Check,
  RefreshCw,
  Download,
  Clock,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Settings,
  Zap,
  Table2,
  BarChart3,
  Smartphone,
} from 'lucide-react';
import { cn, formatDateKST, getTodayKST } from '@/lib/utils';
import * as XLSX from 'xlsx';

// ============================================
// Types
// ============================================

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

type FocusScoreMap = Record<string, Record<string, { score: number; note: string | null; id: string }>>;

type TabType = 'quick' | 'period' | 'report';

interface FocusClientProps {
  initialStudents: Student[];
  initialReport: FocusReport[];
  todayPeriods: Period[];
  dateTypeName: string | null;
  todayDate: string;
  branchId: string | null;
  initialPenaltyPresets: PenaltyPreset[];
  initialFocusPresets: FocusScorePreset[];
  initialFocusScoresByPeriod: FocusScoreMap;
  initialPhoneSubmissions: PhoneSubmissionMap;
}

// ============================================
// Subject Inline Component
// ============================================

function SubjectInline({
  studentId,
  currentSubject,
  onSubjectChange,
}: {
  studentId: string;
  currentSubject: string | null;
  onSubjectChange: (studentId: string, subject: string | null) => void;
}) {
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSubjectsForStudent(studentId)
      .then((list) => { if (!cancelled) setSubjects(list); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const handleSelect = async (subject: string) => {
    if (saving) return;
    const clearing = subject === currentSubject;
    setSaving(true);
    try {
      const result = await setStudentSubject(studentId, clearing ? null : subject);
      if (result.success) onSubjectChange(studentId, clearing ? null : subject);
      else if (result.error) alert(result.error);
    } catch (error) {
      console.error('Failed to set subject:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <RefreshCw className="w-3 h-3 animate-spin text-gray-300 mx-auto" />;
  }

  if (subjects.length === 0) {
    return <span className="text-[10px] text-gray-300">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-0.5">
      {subjects.map((subject) => (
        <button
          key={subject}
          onClick={() => handleSelect(subject)}
          disabled={saving}
          className={cn(
            'px-1 py-0.5 rounded text-[9px] leading-tight transition-all disabled:opacity-50',
            subject === currentSubject
              ? 'bg-primary text-white font-semibold'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          )}
        >
          {subject}
        </button>
      ))}
    </div>
  );
}

// ============================================
// Utilities
// ============================================

const defaultPenaltyPresets = [
  { amount: 1, reason: '졸음/집중력 저하', color: 'bg-red-400' },
  { amount: 2, reason: '휴대폰 사용', color: 'bg-red-500' },
  { amount: 3, reason: '무단 이탈', color: 'bg-red-600' },
];

const FOCUS_COLOR_PALETTE = [
  { label: '파랑', bgClass: 'bg-blue-500', hex: '#3b82f6' },
  { label: '남색', bgClass: 'bg-indigo-500', hex: '#6366f1' },
  { label: '보라', bgClass: 'bg-purple-500', hex: '#a855f7' },
  { label: '청록', bgClass: 'bg-teal-500', hex: '#14b8a6' },
  { label: '에메랄드', bgClass: 'bg-emerald-500', hex: '#10b981' },
  { label: '초록', bgClass: 'bg-green-500', hex: '#22c55e' },
  { label: '노랑', bgClass: 'bg-amber-500', hex: '#f59e0b' },
  { label: '주황', bgClass: 'bg-orange-500', hex: '#f97316' },
  { label: '빨강', bgClass: 'bg-red-500', hex: '#ef4444' },
  { label: '분홍', bgClass: 'bg-pink-500', hex: '#ec4899' },
  { label: '회색', bgClass: 'bg-gray-500', hex: '#6b7280' },
  { label: '슬레이트', bgClass: 'bg-slate-600', hex: '#475569' },
];


function findCurrentPeriod(periods: Period[]): Period | null {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);
  for (const period of periods) {
    if (currentTime >= period.start_time.slice(0, 5) && currentTime <= period.end_time.slice(0, 5)) {
      return period;
    }
  }
  return null;
}

function fmtTime(time: string): string {
  return time.slice(0, 5);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
}

function getScoreColor(score: number | null): string {
  if (score === null) return '';
  if (score >= 9) return 'bg-emerald-100 text-emerald-800';
  if (score >= 7) return 'bg-blue-100 text-blue-800';
  if (score >= 5) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function getScoreBgOnly(score: number | null): string {
  if (score === null) return '';
  if (score >= 9) return 'bg-emerald-50';
  if (score >= 7) return 'bg-blue-50';
  if (score >= 5) return 'bg-amber-50';
  return 'bg-red-50';
}

function getPeriodLabel(period: Period): string {
  return period.name || `${period.period_number}교시`;
}

// ============================================
// Main Component
// ============================================

export function FocusClient({ 
  initialStudents, 
  initialReport, 
  todayPeriods, 
  dateTypeName, 
  todayDate,
  branchId,
  initialPenaltyPresets,
  initialFocusPresets,
  initialFocusScoresByPeriod,
  initialPhoneSubmissions,
}: FocusClientProps) {
  // Core state
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [report, setReport] = useState<FocusReport[]>(initialReport);
  const [focusScoresByPeriod, setFocusScoresByPeriod] = useState<FocusScoreMap>(initialFocusScoresByPeriod);
  const [activeTab, setActiveTab] = useState<TabType>('quick');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null); // "studentId-periodId" for saving indicator
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPresetManager, setShowPresetManager] = useState(false);

  // Date selection state
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [periods, setPeriods] = useState<Period[]>(todayPeriods);
  const [currentDateTypeName, setCurrentDateTypeName] = useState<string | null>(dateTypeName);
  const isToday = selectedDate === todayDate;

  // Preset state
  const [penaltyPresets, setPenaltyPresets] = useState<PenaltyPreset[]>(initialPenaltyPresets);
  const [focusPresets, setFocusPresets] = useState<FocusScorePreset[]>(initialFocusPresets);
  const [newPenaltyAmount, setNewPenaltyAmount] = useState('');
  const [newPenaltyReason, setNewPenaltyReason] = useState('');
  const [newFocusScore, setNewFocusScore] = useState('');
  const [newFocusLabel, setNewFocusLabel] = useState('');
  const [newFocusColor, setNewFocusColor] = useState(FOCUS_COLOR_PALETTE[0].bgClass);
  const [editingColorPresetId, setEditingColorPresetId] = useState<string | null>(null);

  // Phone submission state
  const [phoneSubmissions, setPhoneSubmissions] = useState<PhoneSubmissionMap>(initialPhoneSubmissions);
  const [resettingPhoneSubmissions, setResettingPhoneSubmissions] = useState(false);

  // Show checked-out students toggle
  const [showCheckedOut, setShowCheckedOut] = useState(false);

  // 과거 날짜: 선택 교시에 재실했던 학생 (출석 이벤트 기반)
  const [pastPeriodStudents, setPastPeriodStudents] = useState<Student[] | null>(null);
  const [loadingPastPeriodStudents, setLoadingPastPeriodStudents] = useState(false);

  // Penalty state
  const [customPenaltyReason, setCustomPenaltyReason] = useState('');
  const [customPenaltyAmount, setCustomPenaltyAmount] = useState('1');
  const [selectedStudentsForPenalty, setSelectedStudentsForPenalty] = useState<Set<string>>(new Set());

  // 날짜 변경 시 교시/몰입도 데이터 새로 로드
  useEffect(() => {
    if (selectedDate === todayDate) {
      setPeriods(todayPeriods);
      setCurrentDateTypeName(dateTypeName);
      setFocusScoresByPeriod(initialFocusScoresByPeriod);
      setPhoneSubmissions(initialPhoneSubmissions);
      setSelectedPeriodId('');
      return;
    }
    let cancelled = false;
    const loadDateData = async () => {
      setLoading(true);
      try {
        const [periodsResult, scoresResult, phoneResult] = await Promise.all([
          branchId ? getTodayPeriods(branchId, selectedDate) : Promise.resolve({ periods: [], dateTypeName: null, dateTypeId: null }),
          getTodayFocusScoresByPeriod(branchId, selectedDate),
          getPhoneSubmissions(selectedDate, branchId),
        ]);
        if (!cancelled) {
          setPeriods(periodsResult.periods);
          setCurrentDateTypeName(periodsResult.dateTypeName);
          setFocusScoresByPeriod(scoresResult);
          setPhoneSubmissions(phoneResult);
          setSelectedPeriodId('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadDateData();
    return () => { cancelled = true; };
  }, [selectedDate, todayDate, todayPeriods, dateTypeName, initialFocusScoresByPeriod, initialPhoneSubmissions, branchId]);

  // 과거 학습일 + 교시 선택 시 해당 시간대 재실 학생 조회
  useEffect(() => {
    if (isToday) {
      setPastPeriodStudents(null);
      setLoadingPastPeriodStudents(false);
      return;
    }
    if (!branchId || !selectedPeriodId) {
      setPastPeriodStudents(null);
      setLoadingPastPeriodStudents(false);
      return;
    }
    const period = periods.find((p) => p.id === selectedPeriodId);
    if (!period) {
      setPastPeriodStudents(null);
      setLoadingPastPeriodStudents(false);
      return;
    }
    let cancelled = false;
    setPastPeriodStudents(null);
    setLoadingPastPeriodStudents(true);
    getStudentsPresentDuringPeriod(
      selectedDate,
      period.start_time,
      period.end_time,
      branchId
    )
      .then((list) => {
        if (cancelled) return;
        const mapped: Student[] = list.map((s) => ({
          id: s.id,
          seatNumber: s.seatNumber,
          name: s.name,
          status: 'checked_in' as const,
          currentSubject: null,
          avgFocus: null,
          todayReward: 0,
          todayPenalty: 0,
        }));
        setPastPeriodStudents(mapped);
      })
      .catch(() => {
        if (!cancelled) setPastPeriodStudents([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPastPeriodStudents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isToday, selectedDate, selectedPeriodId, periods, branchId]);

  // Current period auto-select
  const currentPeriod = useMemo(() => isToday ? findCurrentPeriod(periods) : null, [periods, isToday]);
  
  useEffect(() => {
    if (currentPeriod && !selectedPeriodId) {
      setSelectedPeriodId(currentPeriod.id);
    }
  }, [currentPeriod, selectedPeriodId]);

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

  // Filtered students
  const checkedInStudents = useMemo(
    () => students.filter(s => s.status === 'checked_in').sort((a, b) => (a.seatNumber ?? 999) - (b.seatNumber ?? 999)),
    [students]
  );
  const allStudentsSorted = useMemo(
    () => [...students].sort((a, b) => (a.seatNumber ?? 999) - (b.seatNumber ?? 999)),
    [students]
  );

  const displayStudents = useMemo(() => {
    if (!isToday) {
      return (pastPeriodStudents ?? []).sort(
        (a, b) => (a.seatNumber ?? 999) - (b.seatNumber ?? 999)
      );
    }
    if (!showCheckedOut) return checkedInStudents;
    return students
      .filter(s => s.status === 'checked_in' || s.status === 'checked_out')
      .sort((a, b) => (a.seatNumber ?? 999) - (b.seatNumber ?? 999));
  }, [isToday, pastPeriodStudents, students, showCheckedOut, checkedInStudents]);

  // Active presets
  const activePenaltyPresets = penaltyPresets.length > 0 
    ? penaltyPresets.filter(p => p.amount < 999)
    : defaultPenaltyPresets.map((p, i) => ({ ...p, id: `default-${i}`, branch_id: '', sort_order: i, is_active: true }));

  // DB에서 가져온 프리셋만 사용 (is_active 필터링)
  const activeFocusPresets = useMemo(() => {
    return focusPresets.filter(p => p.is_active);
  }, [focusPresets]);

  // ============================================
  // Handlers
  // ============================================

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2000);
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [newStudents, newReport, newScores, periodsResult, newPhoneSubmissions] = await Promise.all([
        getAllStudents('all', branchId ?? undefined),
        getWeeklyFocusReport(branchId),
        getTodayFocusScoresByPeriod(branchId, selectedDate),
        branchId ? getTodayPeriods(branchId, selectedDate) : Promise.resolve({ periods: [], dateTypeName: null, dateTypeId: null }),
        getPhoneSubmissions(selectedDate, branchId),
      ]);
      setStudents(newStudents);
      setReport(newReport);
      setFocusScoresByPeriod(newScores);
      setPeriods(periodsResult.periods);
      setCurrentDateTypeName(periodsResult.dateTypeName);
      setPhoneSubmissions(newPhoneSubmissions);
    } finally {
      setLoading(false);
    }
  }, [branchId, selectedDate]);

  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-focus-attendance')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(() => refreshData(), 500);
      })
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [refreshData]);

  // 브라우저 탭이 다시 포커스될 때 데이터 새로고침 (WebSocket 끊김 대비)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshData]);

  // 주기적 자동 새로고침 (30초 간격, Realtime 끊김 안전망)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshData();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Quick input: record a single student's focus score for selected period
  // 같은 버튼을 다시 누르면 점수 취소
  const handleQuickFocusScore = useCallback(async (studentId: string, score: number, label: string) => {
    if (!selectedPeriodId) {
      alert('교시를 선택해주세요.');
      return;
    }
    const cellKey = `${studentId}-${selectedPeriodId}`;
    setSavingCell(cellKey);
    
    const currentScore = focusScoresByPeriod[studentId]?.[selectedPeriodId];
    const isToggleOff = currentScore?.note === label;
    
    try {
      if (isToggleOff) {
        const result = await deleteFocusScore(
          studentId,
          selectedPeriodId,
          isToday ? undefined : selectedDate
        );
        if (result.success) {
          setFocusScoresByPeriod(prev => {
            const studentScores = { ...(prev[studentId] || {}) };
            delete studentScores[selectedPeriodId];
            return { ...prev, [studentId]: studentScores };
          });
          showSuccess(`${label} 취소됨`);
        } else {
          alert(result.error);
        }
      } else {
        const result = await recordFocusScoreIndividual(
          studentId,
          selectedPeriodId,
          score,
          label,
          isToday ? undefined : selectedDate
        );
        if (result.success) {
          setFocusScoresByPeriod(prev => ({
            ...prev,
            [studentId]: {
              ...(prev[studentId] || {}),
              [selectedPeriodId]: { score, note: label, id: '' },
            },
          }));
          showSuccess(`${score}점 (${label}) 기록 완료`);
        } else {
          alert(result.error);
        }
      }
    } catch (error) {
      console.error('Failed to record/delete focus score:', error);
    } finally {
      setSavingCell(null);
    }
  }, [selectedPeriodId, showSuccess, focusScoresByPeriod, isToday, selectedDate]);

  // Phone submission handler
  const handlePhoneSubmission = useCallback(async (studentId: string, status: PhoneSubmissionStatus) => {
    const prev = phoneSubmissions[studentId] || 'submitted';
    setPhoneSubmissions(old => ({ ...old, [studentId]: status }));
    try {
      const result = await setPhoneSubmission(studentId, selectedDate, status);
      if (result.success) {
        const labels: Record<PhoneSubmissionStatus, string> = { submitted: '제출', not_submitted: '미제출', none: '없음' };
        showSuccess(`핸드폰 ${labels[status]}`);
      } else {
        setPhoneSubmissions(old => ({ ...old, [studentId]: prev }));
        alert(result.error);
      }
    } catch {
      setPhoneSubmissions(old => ({ ...old, [studentId]: prev }));
    }
  }, [phoneSubmissions, selectedDate, showSuccess]);

  const handleClearPhoneSubmissions = useCallback(async () => {
    const ok = window.confirm(
      `선택한 학습일(${selectedDate})의 휴대폰 제출 기록을 모두 삭제합니다.\n계속하시겠습니까?`
    );
    if (!ok) return;
    setResettingPhoneSubmissions(true);
    try {
      const result = await clearPhoneSubmissionsForDate(selectedDate);
      if (result.success) {
        setPhoneSubmissions({});
        showSuccess(
          result.deleted && result.deleted > 0
            ? `휴대폰 제출 ${result.deleted}건을 초기화했습니다.`
            : '휴대폰 제출 기록이 없습니다.'
        );
      } else {
        alert(result.error ?? '초기화에 실패했습니다.');
      }
    } catch {
      alert('초기화에 실패했습니다.');
    } finally {
      setResettingPhoneSubmissions(false);
    }
  }, [selectedDate, showSuccess]);

  // Subject change handler
  const handleSubjectChange = useCallback((studentId: string, subject: string | null) => {
    setStudents(prev => prev.map(s => 
      s.id === studentId ? { ...s, currentSubject: subject } : s
    ));
    showSuccess(subject === null ? '과목 선택을 취소했습니다.' : `과목이 "${subject}"(으)로 변경되었습니다.`);
  }, [showSuccess]);

  // Period view: individual dropdown change
  // value 형식: "score:label" (예: "10:몰입최상" 또는 "5:")
  const handlePeriodScoreChange = useCallback(async (studentId: string, periodId: string, value: string) => {
    if (!value) return;
    
    // value에서 score와 label 파싱
    const [scoreStr, ...labelParts] = value.split(':');
    const score = parseInt(scoreStr);
    if (isNaN(score)) return;

    // label이 있으면 사용, 없으면 undefined
    const note = labelParts.join(':') || undefined;

    const cellKey = `${studentId}-${periodId}`;
    setSavingCell(cellKey);
    try {
      const result = await recordFocusScoreIndividual(
        studentId,
        periodId,
        score,
        note,
        isToday ? undefined : selectedDate
      );
      if (result.success) {
        setFocusScoresByPeriod(prev => ({
          ...prev,
          [studentId]: {
            ...(prev[studentId] || {}),
            [periodId]: { score, note: note || null, id: '' },
          },
        }));
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error('Failed to record focus score:', error);
    } finally {
      setSavingCell(null);
    }
  }, [isToday, selectedDate]);

  // Penalty handlers
  const handleTogglePenaltyStudent = (studentId: string) => {
    const newSet = new Set(selectedStudentsForPenalty);
    if (newSet.has(studentId)) newSet.delete(studentId);
    else newSet.add(studentId);
    setSelectedStudentsForPenalty(newSet);
  };

  const handleBatchPenalty = async (amount: number, reason: string) => {
    if (selectedStudentsForPenalty.size === 0) {
      alert('학생을 선택해주세요.');
      return;
    }
    setLoading(true);
    try {
      const result = await givePointsBatch(Array.from(selectedStudentsForPenalty), 'penalty', amount, reason);
      if (result.success) {
        showSuccess(`${result.count}명에게 벌점 ${amount}점 부여 완료`);
        setSelectedStudentsForPenalty(new Set());
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

  const handleCustomPenalty = () => {
    if (!customPenaltyReason.trim()) { alert('벌점 사유를 입력해주세요.'); return; }
    const amount = parseInt(customPenaltyAmount);
    if (isNaN(amount) || amount < 1) { alert('올바른 벌점 점수를 입력해주세요.'); return; }
    handleBatchPenalty(amount, customPenaltyReason.trim());
  };

  // Preset management handlers
  const handleAddPenaltyPreset = async () => {
    if (!branchId) { alert('지점 정보가 없습니다.'); return; }
    const amount = parseInt(newPenaltyAmount);
    if (isNaN(amount) || amount < 1) { alert('올바른 점수를 입력하세요.'); return; }
    if (!newPenaltyReason.trim()) { alert('사유를 입력하세요.'); return; }
    setLoading(true);
    const result = await createPenaltyPreset(branchId, amount, newPenaltyReason.trim());
    if (result.success) {
      setPenaltyPresets(await getPenaltyPresets(branchId));
      setNewPenaltyAmount(''); setNewPenaltyReason('');
      showSuccess('벌점 프리셋 추가 완료');
    } else { alert(result.error); }
    setLoading(false);
  };

  const handleDeletePenaltyPreset = async (id: string) => {
    if (id.startsWith('default-')) return;
    setLoading(true);
    const result = await deletePenaltyPreset(id);
    if (result.success && branchId) { setPenaltyPresets(await getPenaltyPresets(branchId)); showSuccess('프리셋 삭제 완료'); }
    setLoading(false);
  };

  const handleAddFocusPreset = async () => {
    if (!branchId) { alert('지점 정보가 없습니다.'); return; }
    const score = parseInt(newFocusScore);
    if (isNaN(score) || score < 1 || score > 10) { alert('점수는 1~10 사이로 입력하세요.'); return; }
    if (!newFocusLabel.trim()) { alert('라벨을 입력하세요.'); return; }
    setLoading(true);
    const result = await createFocusScorePreset(branchId, score, newFocusLabel.trim(), newFocusColor);
    if (result.success) {
      setFocusPresets(await getFocusScorePresets(branchId));
      setNewFocusScore(''); setNewFocusLabel('');
      setNewFocusColor(FOCUS_COLOR_PALETTE[0].bgClass);
      showSuccess('몰입도 프리셋 추가 완료');
    } else { alert(result.error); }
    setLoading(false);
  };

  const handleUpdateFocusPresetColor = async (presetId: string, colorClass: string) => {
    setLoading(true);
    const result = await updateFocusScorePreset(presetId, { color: colorClass });
    if (result.success && branchId) {
      setFocusPresets(await getFocusScorePresets(branchId));
      showSuccess('색상 변경 완료');
    } else if (result.error) {
      alert(result.error);
    }
    setEditingColorPresetId(null);
    setLoading(false);
  };

  const handleDeleteFocusPreset = async (id: string) => {
    setLoading(true);
    const result = await deleteFocusScorePreset(id);
    if (result.success && branchId) { setFocusPresets(await getFocusScorePresets(branchId)); showSuccess('프리셋 삭제 완료'); }
    setLoading(false);
  };

  // Weekly report data
  const today = new Date();
  const todayKST = getTodayKST();
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    const dateStr = formatDateKST(date);
    return {
      date: dateStr,
      label: ['일', '월', '화', '수', '목', '금', '토'][i],
      isToday: dateStr === todayKST,
    };
  });

  // ============================================
  // Render
  // ============================================

  return (
    <div className="p-4 md:p-6 space-y-3 max-w-full overflow-hidden">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg md:text-xl font-bold">몰입도 관리</h1>
          <p className="text-text-muted text-xs mt-0.5">학생들의 학습 몰입도를 기록하세요</p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setShowPresetManager(!showPresetManager)}>
            <Settings className="w-3.5 h-3.5 mr-1" />
            <span className="hidden sm:inline">프리셋</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={handleClearPhoneSubmissions}
            disabled={loading || resettingPhoneSubmissions}
            title="선택한 학습일의 휴대폰 제출 기록 전체 삭제"
          >
            <Smartphone className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">휴대폰 제출 초기화</span>
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={refreshData} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* 성공 메시지 토스트 */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-100 text-green-800 px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 animate-in slide-in-from-top z-50 text-xs">
          <Check className="w-3.5 h-3.5" />
          {successMessage}
        </div>
      )}

      {/* 프리셋 관리 패널 */}
      {showPresetManager && (
        <Card className="p-3 bg-gray-50 border-2 border-dashed space-y-4">
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5 text-blue-700 text-xs">
              <Brain className="w-3.5 h-3.5" />
              몰입도 프리셋 관리
            </h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {activeFocusPresets.map((preset) => (
                <div key={preset.id} className="relative">
                  <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white', preset.color || 'bg-blue-500')}>
                    {preset.label} ({preset.score}점)
                    <button
                      onClick={() => setEditingColorPresetId(editingColorPresetId === preset.id ? null : preset.id)}
                      className="ml-0.5 hover:bg-white/20 rounded-full p-0.5"
                      title="색상 변경"
                    >
                      <div className="w-2.5 h-2.5 rounded-full border border-white/60 bg-white/30" />
                    </button>
                    <button onClick={() => handleDeleteFocusPreset(preset.id)} className="hover:bg-white/20 rounded-full p-0.5">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                  {editingColorPresetId === preset.id && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white border rounded-lg shadow-lg p-2">
                      <p className="text-[10px] text-gray-500 mb-1.5">색상 선택</p>
                      <div className="flex flex-wrap gap-1 w-[132px]">
                        {FOCUS_COLOR_PALETTE.map((color) => (
                          <button
                            key={color.bgClass}
                            onClick={() => handleUpdateFocusPresetColor(preset.id, color.bgClass)}
                            title={color.label}
                            className={cn(
                              'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
                              preset.color === color.bgClass ? 'border-gray-800 scale-110' : 'border-transparent'
                            )}
                            style={{ backgroundColor: color.hex }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-1.5 max-w-md">
              <div className="flex gap-1.5">
                <Input type="number" min="1" max="10" placeholder="점수" value={newFocusScore} onChange={(e) => setNewFocusScore(e.target.value)} className="w-16 h-7 text-xs" />
                <Input placeholder="라벨 (예: 인강)" value={newFocusLabel} onChange={(e) => setNewFocusLabel(e.target.value)} className="flex-1 h-7 text-xs" />
                <Button size="sm" className="h-7 px-2" onClick={handleAddFocusPreset} disabled={loading}><Plus className="w-3.5 h-3.5" /></Button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">색상:</span>
                <div className="flex flex-wrap gap-1">
                  {FOCUS_COLOR_PALETTE.map((color) => (
                    <button
                      key={color.bgClass}
                      onClick={() => setNewFocusColor(color.bgClass)}
                      title={color.label}
                      className={cn(
                        'w-4 h-4 rounded-full border-2 transition-transform hover:scale-110',
                        newFocusColor === color.bgClass ? 'border-gray-700 scale-110' : 'border-transparent'
                      )}
                      style={{ backgroundColor: color.hex }}
                    />
                  ))}
                </div>
                <span
                  className={cn('ml-1 px-2 py-0.5 rounded-full text-[10px] text-white font-medium', newFocusColor)}
                >
                  미리보기
                </span>
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-1.5 text-red-700 text-xs">
              <Settings className="w-3.5 h-3.5" />
              벌점 프리셋 관리
            </h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {activePenaltyPresets.map((preset) => (
                <span key={preset.id} className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white', preset.color || 'bg-red-500')}>
                  {preset.reason} (-{preset.amount}점)
                  {!preset.id.startsWith('default-') && (
                    <button onClick={() => handleDeletePenaltyPreset(preset.id)} className="ml-0.5 hover:bg-white/20 rounded-full p-0.5">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex gap-1.5 max-w-md">
              <Input type="number" min="1" placeholder="점수" value={newPenaltyAmount} onChange={(e) => setNewPenaltyAmount(e.target.value)} className="w-16 h-7 text-xs" />
              <Input placeholder="사유 (예: 지각)" value={newPenaltyReason} onChange={(e) => setNewPenaltyReason(e.target.value)} className="flex-1 h-7 text-xs" />
              <Button size="sm" className="h-7 px-2" onClick={handleAddPenaltyPreset} disabled={loading}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        </Card>
      )}

      {/* 날짜/교시 정보 */}
      <Card className="p-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium text-xs">{formatDate(selectedDate)}</span>
              <span className={cn("px-1.5 py-0.5 rounded-full text-[10px]", currentDateTypeName ? "bg-primary/10 text-primary" : "bg-yellow-100 text-yellow-700")}>
                {currentDateTypeName || '미지정'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-36 h-7 text-xs"
              />
              {!isToday && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 whitespace-nowrap px-2.5 text-xs"
                  onClick={() => setSelectedDate(todayDate)}
                >
                  오늘
                </Button>
              )}
            </div>
            {activeTab !== 'report' && periods.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-text-muted text-xs">교시:</span>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="px-1.5 py-1 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs"
                >
                  <option value="">선택</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {getPeriodLabel(period)} ({fmtTime(period.start_time)}~{fmtTime(period.end_time)})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {currentPeriod && isToday && (
            <div className="text-xs text-text-muted">
              현재: <span className="font-medium text-primary">{getPeriodLabel(currentPeriod)}</span>
            </div>
          )}
        </div>
      </Card>

      {/* 탭 네비게이션 */}
      <div className="flex items-center border-b border-gray-200">
        {([
          { key: 'quick' as TabType, label: '빠른 입력', icon: Zap },
          { key: 'period' as TabType, label: '교시별', icon: Table2 },
          { key: 'report' as TabType, label: '주간 리포트', icon: BarChart3 },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={cn(
              'flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
            onClick={() => setActiveTab(key)}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        {!isToday && activeTab !== 'report' && (
          <span className="ml-auto text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 max-w-[220px] leading-tight">
            선택한 교시 시간에 입실·재실 기록이 있는 학생만 표시됩니다.
          </span>
        )}
        {isToday && activeTab !== 'report' && (
          <label className="ml-auto flex items-center gap-1.5 px-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCheckedOut}
              onChange={(e) => setShowCheckedOut(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary/50 w-3.5 h-3.5"
            />
            <span className="text-[11px] text-gray-500 whitespace-nowrap">퇴실 학생 포함</span>
          </label>
        )}
      </div>

      {/* 탭 내용 */}
      {activeTab === 'quick' && (
        <QuickInputView
          students={displayStudents}
          presets={activeFocusPresets}
          selectedPeriodId={selectedPeriodId}
          selectedPeriod={selectedPeriod}
          focusScoresByPeriod={focusScoresByPeriod}
          savingCell={savingCell}
          onQuickScore={handleQuickFocusScore}
          onSubjectChange={handleSubjectChange}
          phoneSubmissions={phoneSubmissions}
          onPhoneSubmission={handlePhoneSubmission}
          isPastDate={!isToday}
          loadingPastStudents={!isToday && loadingPastPeriodStudents}
        />
      )}

      {activeTab === 'period' && (
        <PeriodTableView
          students={displayStudents}
          periods={periods}
          presets={activeFocusPresets}
          focusScoresByPeriod={focusScoresByPeriod}
          savingCell={savingCell}
          onScoreChange={handlePeriodScoreChange}
          currentPeriod={currentPeriod}
          phoneSubmissions={phoneSubmissions}
          onPhoneSubmission={handlePhoneSubmission}
          isPastDate={!isToday}
          loadingPastStudents={!isToday && loadingPastPeriodStudents}
          selectedPeriodId={selectedPeriodId}
        />
      )}

      {activeTab === 'report' && (
        <WeeklyReportView
          report={report}
          weekDays={weekDays}
        />
      )}

      {/* 벌점 섹션 (빠른 입력/교시별 탭에서만) */}
      {(activeTab === 'quick' || activeTab === 'period') && (
        <PenaltySection
          students={isToday ? checkedInStudents : displayStudents}
          selectedStudents={selectedStudentsForPenalty}
          penaltyPresets={activePenaltyPresets}
          loading={loading}
          customPenaltyAmount={customPenaltyAmount}
          customPenaltyReason={customPenaltyReason}
          onToggleStudent={handleTogglePenaltyStudent}
          onSelectAll={() => {
            const penaltyList = isToday ? checkedInStudents : displayStudents;
            if (selectedStudentsForPenalty.size === penaltyList.length) {
              setSelectedStudentsForPenalty(new Set());
            } else {
              setSelectedStudentsForPenalty(new Set(penaltyList.map(s => s.id)));
            }
          }}
          onBatchPenalty={handleBatchPenalty}
          onCustomPenalty={handleCustomPenalty}
          onSetAmount={setCustomPenaltyAmount}
          onSetReason={setCustomPenaltyReason}
        />
      )}
    </div>
  );
}

// ============================================
// Quick Input View
// ============================================

const PHONE_STATUS_OPTIONS: { value: PhoneSubmissionStatus; label: string; color: string; activeColor: string }[] = [
  { value: 'submitted', label: '제출', color: 'bg-gray-100 text-gray-500 hover:bg-emerald-50', activeColor: 'bg-emerald-500 text-white ring-2 ring-emerald-300' },
  { value: 'not_submitted', label: '미제출', color: 'bg-gray-100 text-gray-500 hover:bg-red-50', activeColor: 'bg-red-500 text-white ring-2 ring-red-300' },
  { value: 'none', label: '없음', color: 'bg-gray-100 text-gray-500 hover:bg-gray-200', activeColor: 'bg-gray-500 text-white ring-2 ring-gray-300' },
];

function QuickInputView({
  students,
  presets,
  selectedPeriodId,
  selectedPeriod,
  focusScoresByPeriod,
  savingCell,
  onQuickScore,
  onSubjectChange,
  phoneSubmissions,
  onPhoneSubmission,
  isPastDate = false,
  loadingPastStudents = false,
}: {
  students: Student[];
  presets: FocusScorePreset[];
  selectedPeriodId: string;
  selectedPeriod: Period | undefined;
  focusScoresByPeriod: FocusScoreMap;
  savingCell: string | null;
  onQuickScore: (studentId: string, score: number, label: string) => void;
  onSubjectChange: (studentId: string, subject: string | null) => void;
  phoneSubmissions: PhoneSubmissionMap;
  onPhoneSubmission: (studentId: string, status: PhoneSubmissionStatus) => void;
  isPastDate?: boolean;
  loadingPastStudents?: boolean;
}) {
  if (!selectedPeriodId) {
    return (
      <Card className="p-4 text-center">
        <AlertCircle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
        <p className="text-text-muted text-xs">교시를 먼저 선택해주세요.</p>
      </Card>
    );
  }

  if (isPastDate && loadingPastStudents) {
    return (
      <Card className="p-4 text-center text-text-muted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-primary mb-2" />
        해당 교시에 재실했던 학생 목록을 불러오는 중…
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <Card className="p-4 text-center text-text-muted text-xs">
        {isPastDate
          ? '이 교시 시간대에 출석·재실 기록이 있는 학생이 없습니다.'
          : '현재 입실 중인 학생이 없습니다.'}
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-2 py-1.5 bg-gray-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-xs">빠른 몰입도 입력</span>
          <span className="text-[10px] text-text-muted">
            ({selectedPeriod ? getPeriodLabel(selectedPeriod) : ''})
          </span>
        </div>
        <span className="text-[10px] text-text-muted">{students.length}명</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50/50 border-b">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 w-10">번호</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 min-w-[50px]">이름</th>
              <th className="px-1 py-1.5 text-left text-xs font-medium text-gray-500">과목</th>
              <th className="px-0.5 lg:px-1 py-1.5 text-center text-xs font-medium text-gray-500">
                <div className="flex items-center justify-center gap-0.5 whitespace-nowrap">
                  <Smartphone className="w-3 h-3 shrink-0" />
                  <span className="hidden lg:inline">폰</span>
                </div>
              </th>
              {presets.map((preset) => (
                <th key={preset.id} className="px-0.5 py-1 text-center text-xs font-medium text-gray-500 min-w-[36px]">
                  <div>{preset.label}</div>
                  <div className="text-gray-400 font-normal text-[10px]">({preset.score})</div>
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 w-10">현재</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((student) => {
              const studentScores = focusScoresByPeriod[student.id] || {};
              const currentScore = studentScores[selectedPeriodId];
              const isCheckedOut = student.status === 'checked_out';
              const phoneStatus = phoneSubmissions[student.id] || 'submitted';
              
              return (
                <tr key={student.id} className={cn(
                  isCheckedOut ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50/50'
                )}>
                  <td className="px-2 py-1">
                    <span className={cn('font-semibold text-xs', isCheckedOut ? 'text-gray-400' : 'text-primary')}>{student.seatNumber ?? '-'}</span>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-xs truncate">{student.name}</span>
                      {isCheckedOut && (
                        <span className="text-[9px] text-gray-400 bg-gray-200 px-1 py-0.5 rounded shrink-0">퇴실</span>
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-1">
                    {isCheckedOut ? (
                      <span className="text-[10px] text-gray-300 px-1">-</span>
                    ) : (
                      <SubjectInline
                        studentId={student.id}
                        currentSubject={student.currentSubject}
                        onSubjectChange={onSubjectChange}
                      />
                    )}
                  </td>
                  <td className="px-0.5 py-0.5 text-center">
                    {isCheckedOut ? (
                      <span className="text-[9px] text-gray-300">-</span>
                    ) : (
                      <div className="flex flex-row flex-nowrap gap-0.5 justify-center items-center">
                        {PHONE_STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => onPhoneSubmission(student.id, opt.value)}
                            className={cn(
                              'px-1 py-0.5 rounded text-[8px] font-semibold transition-all leading-tight shrink-0',
                              phoneStatus === opt.value ? opt.activeColor : opt.color
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  {presets.map((preset) => {
                    const cellKey = `${student.id}-${selectedPeriodId}`;
                    const isSaving = savingCell === cellKey;
                    const isActive = currentScore?.note === preset.label;
                    const hasOtherSelection = currentScore && !isActive;

                    return (
                      <td key={preset.id} className="px-0.5 py-0.5 text-center">
                        <button
                          className={cn(
                            'w-full min-h-[22px] px-1 py-0.5 rounded text-[9px] font-semibold transition-all',
                            'active:scale-95 disabled:opacity-40',
                            isCheckedOut
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : isActive
                                ? 'ring-2 ring-offset-1 ring-primary bg-primary text-white shadow-md'
                                : hasOtherSelection
                                  ? cn(
                                      'text-white/70 shadow-sm opacity-50 hover:opacity-80',
                                      preset.color || (preset.score >= 9 ? 'bg-emerald-600' : preset.score >= 7 ? 'bg-blue-500' : 'bg-amber-500')
                                    )
                                  : cn(
                                      'text-white shadow-sm hover:opacity-90',
                                      preset.color || (preset.score >= 9 ? 'bg-emerald-600' : preset.score >= 7 ? 'bg-blue-500' : 'bg-amber-500')
                                    )
                          )}
                          onClick={() => onQuickScore(student.id, preset.score, preset.label)}
                          disabled={isSaving || isCheckedOut}
                        >
                          {isSaving ? (
                            <RefreshCw className="w-2.5 h-2.5 animate-spin mx-auto" />
                          ) : isActive ? (
                            <span className="flex items-center justify-center gap-0.5">
                              <Check className="w-2.5 h-2.5" />
                              {preset.label}
                            </span>
                          ) : (
                            preset.label
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center">
                    {currentScore ? (
                      <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold', getScoreColor(currentScore.score))}>
                        {currentScore.score}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================
// Period Table View
// ============================================

function PeriodTableView({
  students,
  periods,
  presets,
  focusScoresByPeriod,
  savingCell,
  onScoreChange,
  currentPeriod,
  phoneSubmissions,
  onPhoneSubmission,
  isPastDate = false,
  loadingPastStudents = false,
  selectedPeriodId = '',
}: {
  students: Student[];
  periods: Period[];
  presets: FocusScorePreset[];
  focusScoresByPeriod: FocusScoreMap;
  savingCell: string | null;
  onScoreChange: (studentId: string, periodId: string, value: string) => void;
  currentPeriod: Period | null;
  phoneSubmissions: PhoneSubmissionMap;
  onPhoneSubmission: (studentId: string, status: PhoneSubmissionStatus) => void;
  isPastDate?: boolean;
  loadingPastStudents?: boolean;
  selectedPeriodId?: string;
}) {
  if (isPastDate && loadingPastStudents) {
    return (
      <Card className="p-4 text-center text-text-muted text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-primary mb-2" />
        해당 교시에 재실했던 학생 목록을 불러오는 중…
      </Card>
    );
  }

  if (isPastDate && !selectedPeriodId) {
    return (
      <Card className="p-4 text-center">
        <AlertCircle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
        <p className="text-text-muted text-xs">과거 날짜는 상단에서 교시를 먼저 선택해주세요.</p>
      </Card>
    );
  }

  if (periods.length === 0) {
    return (
      <Card className="p-4 text-center">
        <AlertCircle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
        <p className="text-text-muted text-xs">오늘 교시가 설정되지 않았습니다.</p>
      </Card>
    );
  }

  if (students.length === 0) {
    return (
      <Card className="p-4 text-center text-text-muted text-xs">
        {isPastDate
          ? '이 교시 시간대에 출석·재실 기록이 있는 학생이 없습니다.'
          : '현재 입실 중인 학생이 없습니다.'}
      </Card>
    );
  }

  // Build dropdown options from presets only
  // value를 `score:label` 형태로 설정하여 같은 점수를 가진 프리셋을 구분
  const scoreOptions = [
    { value: '', label: '-' },
    ...presets.map(p => ({ value: `${p.score}:${p.label}`, label: `${p.label}(${p.score})` })),
  ];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-2 py-1.5 bg-gray-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Table2 className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-xs">교시별 몰입도</span>
        </div>
        <span className="text-[10px] text-text-muted">{students.length}명 / {periods.length}교시</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="sticky left-0 z-10 bg-gray-50 px-2 py-1.5 text-left text-xs font-medium text-gray-500 w-10 border-r">번호</th>
              <th className="sticky left-10 z-10 bg-gray-50 px-2 py-1.5 text-left text-xs font-medium text-gray-500 min-w-[50px] border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">이름</th>
              <th className="px-0.5 lg:px-1 py-1.5 text-center text-xs font-medium text-gray-500">
                <div className="flex items-center justify-center gap-0.5 whitespace-nowrap">
                  <Smartphone className="w-3 h-3 shrink-0" />
                  <span className="hidden lg:inline">폰</span>
                </div>
              </th>
              {periods.map((period) => (
                <th
                  key={period.id}
                  className={cn(
                    'px-1 py-1.5 text-center text-xs font-medium min-w-[56px]',
                    currentPeriod?.id === period.id ? 'text-primary bg-primary/5' : 'text-gray-500'
                  )}
                >
                  <div>{getPeriodLabel(period)}</div>
                  <div className="text-gray-400 font-normal text-[10px]">{fmtTime(period.start_time)}</div>
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 w-12 border-l">평균</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((student) => {
              const studentScores = focusScoresByPeriod[student.id] || {};
              const scores = periods.map(p => studentScores[p.id]?.score ?? null).filter((s): s is number => s !== null);
              const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null;
              const isCheckedOut = student.status === 'checked_out';

              return (
                <tr key={student.id} className={cn(
                  isCheckedOut ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50/50'
                )}>
                  <td className={cn('sticky left-0 z-10 px-2 py-1 border-r', isCheckedOut ? 'bg-gray-50' : 'bg-white')}>
                    <span className={cn('font-semibold text-xs', isCheckedOut ? 'text-gray-400' : 'text-primary')}>{student.seatNumber ?? '-'}</span>
                  </td>
                  <td className={cn('sticky left-10 z-10 px-2 py-1 border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]', isCheckedOut ? 'bg-gray-50' : 'bg-white')}>
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-xs truncate block max-w-[60px]">{student.name}</span>
                      {isCheckedOut && (
                        <span className="text-[9px] text-gray-400 bg-gray-200 px-1 py-0.5 rounded shrink-0">퇴실</span>
                      )}
                    </div>
                  </td>
                  <td className="px-0.5 py-0.5 text-center">
                    {isCheckedOut ? (
                      <span className="text-[9px] text-gray-300">-</span>
                    ) : (
                      <div className="flex flex-row flex-nowrap gap-0.5 justify-center items-center">
                        {PHONE_STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => onPhoneSubmission(student.id, opt.value)}
                            className={cn(
                              'px-1 py-0.5 rounded text-[8px] font-semibold transition-all leading-tight shrink-0',
                              (phoneSubmissions[student.id] || 'submitted') === opt.value ? opt.activeColor : opt.color
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  {periods.map((period) => {
                    const cellKey = `${student.id}-${period.id}`;
                    const isSaving = savingCell === cellKey;
                    const scoreData = studentScores[period.id];
                    const isCurrentPeriod = currentPeriod?.id === period.id;

                    return (
                      <td
                        key={period.id}
                        className={cn(
                          'px-0.5 py-1 text-center',
                          !isCheckedOut && isCurrentPeriod && 'bg-primary/5',
                          !isCheckedOut && scoreData && getScoreBgOnly(scoreData.score)
                        )}
                      >
                        {isCheckedOut ? (
                          <div className="w-full min-h-[28px] flex items-center justify-center">
                            {scoreData ? (
                              <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold', getScoreColor(scoreData.score))}>
                                {scoreData.score}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">-</span>
                            )}
                          </div>
                        ) : (
                          <div className="relative">
                            <select
                              value={scoreData ? `${scoreData.score}:${scoreData.note || ''}` : ''}
                              onChange={(e) => onScoreChange(student.id, period.id, e.target.value)}
                              disabled={isSaving}
                              className={cn(
                                'w-full min-h-[28px] px-0.5 py-0.5 rounded-md border text-[10px] font-medium text-center appearance-none cursor-pointer',
                                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                                scoreData
                                  ? cn('border-transparent font-bold', getScoreColor(scoreData.score))
                                  : 'border-gray-200 text-gray-400',
                                isSaving && 'opacity-50'
                              )}
                            >
                              {scoreOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            {isSaving && (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-md">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin text-primary" />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center border-l">
                    {avg !== null ? (
                      <span className={cn('inline-flex items-center justify-center w-7 h-6 rounded-full text-[10px] font-bold', getScoreColor(avg))}>
                        {avg}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================
// Weekly Report View
// ============================================

function WeeklyReportView({
  report,
  weekDays,
}: {
  report: FocusReport[];
  weekDays: { date: string; label: string; isToday: boolean }[];
}) {
  const handleExcelDownload = () => {
    // 헤더 행 구성
    const headers = [
      '번호',
      '이름',
      ...weekDays.map((day) => `${day.label} (${day.date.slice(5)})`),
      '평균',
    ];

    // 데이터 행 구성
    const rows = report.map((student) => {
      const dailyAvgs = weekDays.map((day) => {
        const scores = student.dailyScores[day.date] || [];
        if (scores.length === 0) return '';
        return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10;
      });
      return [
        student.seatNumber || '-',
        student.name,
        ...dailyAvgs,
        student.weeklyAvg ?? '',
      ];
    });

    // 워크시트 생성
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 열 너비 설정
    ws['!cols'] = [
      { wch: 6 },   // 번호
      { wch: 10 },  // 이름
      ...weekDays.map(() => ({ wch: 12 })), // 요일별
      { wch: 8 },   // 평균
    ];

    // 워크북 생성 및 다운로드
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '주간 몰입도 리포트');

    const kstDate = getTodayKST();
    XLSX.writeFile(wb, `몰입도_주간리포트_${kstDate}.xlsx`);
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-2 py-1.5 bg-gray-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-xs">주간 몰입도 리포트</span>
        </div>
        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={handleExcelDownload}>
          <Download className="w-3 h-3 mr-1" />
          <span className="hidden sm:inline">엑셀</span>
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50/50 border-b">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-2 py-1.5 text-left text-xs font-medium text-text-muted border-r">학생</th>
              {weekDays.map((day) => (
                <th
                  key={day.date}
                  className={cn(
                    'px-2 py-1.5 text-center text-xs font-medium min-w-[44px]',
                    day.isToday ? 'text-primary bg-primary/5' : 'text-text-muted'
                  )}
                >
                  {day.label}
                  <br />
                  <span className="text-[10px] font-normal">{day.date.slice(5)}</span>
                </th>
              ))}
              <th className="px-2 py-1.5 text-center text-xs font-medium text-text-muted border-l">평균</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-4 text-center text-text-muted text-xs">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              report.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 border-r">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-primary font-medium">{student.seatNumber || '-'}</span>
                      <span className="text-xs">{student.name}</span>
                    </div>
                  </td>
                  {weekDays.map((day) => {
                    const scores = student.dailyScores[day.date] || [];
                    const avg = scores.length > 0
                      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
                      : null;
                    return (
                      <td key={day.date} className={cn('px-2 py-1 text-center', day.isToday && 'bg-primary/5')}>
                        {avg !== null ? (
                          <span className={cn(
                            'font-medium text-xs',
                            avg >= 8 ? 'text-green-600' :
                            avg >= 6 ? 'text-primary' :
                            avg >= 4 ? 'text-yellow-600' : 'text-red-500'
                          )}>
                            {avg}
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center border-l">
                    {student.weeklyAvg !== null ? (
                      <span className="font-semibold text-primary text-xs">{student.weeklyAvg}</span>
                    ) : (
                      <span className="text-text-muted text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================
// Penalty Section
// ============================================

function PenaltySection({
  students,
  selectedStudents,
  penaltyPresets,
  loading,
  customPenaltyAmount,
  customPenaltyReason,
  onToggleStudent,
  onSelectAll,
  onBatchPenalty,
  onCustomPenalty,
  onSetAmount,
  onSetReason,
}: {
  students: Student[];
  selectedStudents: Set<string>;
  penaltyPresets: (PenaltyPreset | { id: string; amount: number; reason: string; color: string; branch_id: string; sort_order: number; is_active: boolean })[];
  loading: boolean;
  customPenaltyAmount: string;
  customPenaltyReason: string;
  onToggleStudent: (id: string) => void;
  onSelectAll: () => void;
  onBatchPenalty: (amount: number, reason: string) => void;
  onCustomPenalty: () => void;
  onSetAmount: (v: string) => void;
  onSetReason: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-2">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          <span className="font-semibold text-xs">벌점 부여</span>
          {selectedStudents.size > 0 && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-medium">
              {selectedStudents.size}명 선택
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* 학생 선택 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-gray-500">학생 선택</p>
              <button className="text-[10px] text-primary hover:underline" onClick={onSelectAll}>
                {selectedStudents.size === students.length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {students.map((student) => (
                <button
                  key={student.id}
                  className={cn(
                    'px-1.5 py-1 rounded-md text-[10px] font-medium transition-all border',
                    selectedStudents.has(student.id)
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                  onClick={() => onToggleStudent(student.id)}
                >
                  {student.seatNumber ?? '-'} {student.name}
                </button>
              ))}
            </div>
          </div>

          {/* 빠른 벌점 */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1.5">빠른 벌점</p>
            <div className="flex flex-wrap gap-1.5">
              {penaltyPresets.map((preset) => (
                <button
                  key={preset.id}
                  className={cn(
                    'px-2 py-1 rounded-md text-[10px] font-semibold text-white shadow-sm',
                    'hover:opacity-90 active:scale-95 transition-all',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    preset.color || 'bg-red-500'
                  )}
                  onClick={() => onBatchPenalty(preset.amount, preset.reason)}
                  disabled={loading || selectedStudents.size === 0}
                >
                  {preset.reason} (-{preset.amount})
                </button>
              ))}
            </div>
          </div>

          {/* 직접 입력 */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1.5">직접 입력</p>
            <div className="flex gap-1.5">
              <Input
                type="number" min="1" max="10"
                value={customPenaltyAmount}
                onChange={(e) => onSetAmount(e.target.value)}
                className="w-12 h-7 text-xs"
                placeholder="점수"
              />
              <Input
                value={customPenaltyReason}
                onChange={(e) => onSetReason(e.target.value)}
                className="flex-1 h-7 text-xs"
                placeholder="벌점 사유 입력..."
              />
              <Button
                size="sm"
                variant="danger"
                onClick={onCustomPenalty}
                disabled={loading || selectedStudents.size === 0}
                className="h-7 text-[10px] px-2"
              >
                부여
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
