'use client';

import { useState, useTransition, Fragment } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { Pagination } from '@/components/ui/pagination';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import {
  givePoints,
  giveRewardBatch,
  getAllPointsHistory,
  createRewardPreset,
  deleteRewardPreset,
  createPenaltyPreset,
  deletePenaltyPreset,
  getRewardPresets,
  getPenaltyPresets,
  deletePoint,
  deletePoints,
  deletePointsByFilter,
  type RewardPreset,
  type PenaltyPreset,
  type PointsHistoryRow,
  type PointsHistoryResult,
} from '@/lib/actions/admin';
import { buildListHref } from '@/lib/list-params';
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
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PointsTab } from './list-config';
import { WithdrawalReviewTab } from './withdrawal-review-tab';
import { RedemptionQueueTab } from './redemption-queue-tab';

function SortIcon({
  sortKey,
  current,
  dir,
  small,
}: {
  sortKey: string;
  current: string;
  dir: 'asc' | 'desc';
  small?: boolean;
}) {
  const size = small ? 'w-3 h-3' : 'w-3.5 h-3.5';
  if (current !== sortKey) return <ChevronsUpDown className={cn(size, 'opacity-30')} />;
  return dir === 'asc' ? <ChevronUp className={cn(size)} /> : <ChevronDown className={cn(size)} />;
}

interface PointsOverview {
  id: string;
  seatNumber: number | null;
  name: string;
  reward: number;
  penalty: number;
  total: number;
}

interface Student {
  id: string;
  seatNumber: number | null;
  name: string;
}

interface ReviewQueueRow {
  studentId: string;
  name: string;
  seatNumber: number | null;
  kind: 'review' | 'required';
  reviewAt: string | null;
  reviewReason: string | null;
  consumedAt: string | null;
  requiredAt: string | null;
  requiredReason: string | null;
  markedAt: string | null;
  markedReason: string | null;
  penaltyQuarter: number;
  penaltyQuarterRaw: number;
  penaltyOffsetInQuarter: number;
  lastPenalty: { reason: string; amount: number; createdAt: string } | null;
  protectedRedemptionCount: number;
}

interface RedemptionQueueRow {
  id: string;
  student_id: string;
  status: string;
  points_used: number;
  voucher_amount: number | null;
  voucher_code: string | null;
  trigger: string;
  requested_at: string;
  issued_at: string | null;
  profiles?: { name?: string; branch_id?: string } | { name?: string; branch_id?: string }[] | null;
}

interface PointsClientProps {
  activeTab: PointsTab;
  initialOverview: PointsOverview[];
  initialHistoryResult: PointsHistoryResult;
  students: Student[];
  /** null = 전 지점 (슈퍼관리자) */
  branchId: string | null;
  initialRewardPresets: RewardPreset[];
  initialPenaltyPresets: PenaltyPreset[];
  initialReviewQueue: ReviewQueueRow[];
  initialRequiredQueue: ReviewQueueRow[];
  initialRedemptionQueue: RedemptionQueueRow[];
}

type SortDir = 'asc' | 'desc';
type OverviewSortKey = 'seatNumber' | 'name' | 'reward' | 'penalty' | 'total';

export function PointsClient({
  activeTab,
  initialOverview,
  initialHistoryResult,
  students,
  branchId,
  initialRewardPresets,
  initialPenaltyPresets,
  initialReviewQueue,
  initialRequiredQueue,
  initialRedemptionQueue,
}: PointsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Overview 정렬 — 클라이언트 측 (overview 는 학생 수만큼이라 작음)
  const [overviewSortKey, setOverviewSortKey] = useState<OverviewSortKey>('seatNumber');
  const [overviewSortDir, setOverviewSortDir] = useState<SortDir>('asc');

  // 다중 선택 (현재 페이지 한정)
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showFilterDeleteConfirm, setShowFilterDeleteConfirm] = useState(false);

  // 프리셋 상태
  const [rewardPresets, setRewardPresets] = useState<RewardPreset[]>(initialRewardPresets);
  const [penaltyPresets, setPenaltyPresets] = useState<PenaltyPreset[]>(initialPenaltyPresets);

  // 새 프리셋 입력
  const [newRewardAmount, setNewRewardAmount] = useState('');
  const [newRewardReason, setNewRewardReason] = useState('');
  const [newPenaltyAmount, setNewPenaltyAmount] = useState('');
  const [newPenaltyReason, setNewPenaltyReason] = useState('');

  // 아코디언
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<PointsHistoryRow[]>([]);
  const [expandedHistoryPage, setExpandedHistoryPage] = useState(0);
  const [expandedLoading, setExpandedLoading] = useState(false);

  // 부여 폼 상태 — 학생은 Set 으로 다중 선택. 단건 부여는 size === 1 케이스.
  // 벌점은 임계치 RPC 가 학생별 트랜잭션이어야 안전해 다중 부여 비대상 — UI 에서 단건 강제.
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearchText, setStudentSearchText] = useState<string>('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [pointType, setPointType] = useState<'reward' | 'penalty'>('reward');
  const [amount, setAmount] = useState<string>('1');
  const [reason, setReason] = useState<string>('');
  const [additionalNote, setAdditionalNote] = useState<string>('');

  const overview = initialOverview;
  const history = initialHistoryResult.rows;
  const historyTotal = initialHistoryResult.total;
  const historyPage = initialHistoryResult.page;
  const historyPageSize = initialHistoryResult.pageSize;

  // URL 에서 history 정렬·필터 읽기
  const historySort = (sp.get('sort') ?? 'created_at') as 'created_at' | 'amount';
  const historyDir = (sp.get('dir') ?? 'desc') as SortDir;
  const historyTypeFilter = sp.get('type') ?? '';
  const historyStudentFilter = sp.get('studentId') ?? '';
  const historyQ = sp.get('q') ?? '';

  // overview 탭 페이지네이션 — 학생 수가 지점당 50-200 으로 작아 클라이언트 슬라이스.
  // history 와 같은 ?page= 파라미터 공유 (탭 전환 시 Tabs 컴포넌트가 page 자동 reset).
  const OVERVIEW_PAGE_SIZE = 30;
  const overviewPageNum = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1);

  function patchUrl(patch: Record<string, string | number | null>) {
    const cleaned = { ...patch, page: null }; // 필터/정렬 변경 시 1페이지로
    const href = buildListHref(pathname, new URLSearchParams(sp.toString()), cleaned);
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function refreshData() {
    startTransition(() => router.refresh());
  }

  // ── Overview 정렬 ───────────────────────────────────────
  const sortedOverview = [...overview].sort((a, b) => {
    let cmp = 0;
    if (overviewSortKey === 'seatNumber') cmp = (a.seatNumber ?? 9999) - (b.seatNumber ?? 9999);
    else if (overviewSortKey === 'name') cmp = a.name.localeCompare(b.name, 'ko');
    else if (overviewSortKey === 'reward') cmp = a.reward - b.reward;
    else if (overviewSortKey === 'penalty') cmp = a.penalty - b.penalty;
    else if (overviewSortKey === 'total') cmp = a.total - b.total;
    return overviewSortDir === 'asc' ? cmp : -cmp;
  });

  function handleOverviewSort(key: OverviewSortKey) {
    if (overviewSortKey === key) {
      setOverviewSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOverviewSortKey(key);
      setOverviewSortDir('asc');
    }
    setExpandedStudentId(null);
  }

  function handleHistorySort(key: 'created_at' | 'amount') {
    if (historySort === key) {
      patchUrl({ dir: historyDir === 'asc' ? 'desc' : 'asc' });
    } else {
      patchUrl({ sort: key, dir: 'desc' });
    }
  }

  // 선택된 reason 텍스트가 등록된 preset 과 일치하면 그 preset.id 반환.
  // additionalNote 가 붙어 reason 이 변형되면 null (= custom reason, 중복 차단 미적용).
  function findPresetId(type: 'reward' | 'penalty', reasonText: string): string | null {
    const presets = type === 'reward' ? rewardPresets : penaltyPresets;
    const found = presets.find((p) => p.reason === reasonText);
    return found?.id ?? null;
  }

  // ── 부여 폼 ─────────────────────────────────────────────
  const filteredStudentsForSearch = studentSearchText
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(studentSearchText.toLowerCase()) ||
          String(s.seatNumber || '').includes(studentSearchText),
      )
    : students;

  function toggleSelectStudent(studentId: string) {
    setSelectedStudentIds((prev) => {
      // 벌점은 단건만 — 토글이지만 다른 선택이 있으면 교체.
      if (pointType === 'penalty') {
        return prev.has(studentId) ? new Set() : new Set([studentId]);
      }
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function clearSelectedStudents() {
    setSelectedStudentIds(new Set());
  }

  function setPointTypeWithGuard(nextType: 'reward' | 'penalty') {
    setPointType(nextType);
    setReason('');
    setAmount('1');
    // 벌점 전환 시 다중 선택을 첫 1명으로 trim (Set 의 insertion order)
    if (nextType === 'penalty') {
      setSelectedStudentIds((prev) => {
        if (prev.size <= 1) return prev;
        const first = prev.values().next().value;
        return first ? new Set([first]) : new Set();
      });
    }
  }

  function resetForm() {
    setShowAddForm(false);
    setSelectedStudentIds(new Set());
    setStudentSearchText('');
    setShowStudentDropdown(false);
    setPointType('reward');
    setAmount('1');
    setReason('');
    setAdditionalNote('');
  }

  function showSuccess(message: string, durationMs: number = 2000) {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), durationMs);
  }

  // 다중 토스트용 부가 표기 (중복/미매칭/실패 합쳐 한 줄)
  function formatBatchExtras(parts: {
    duplicateCount: number;
    unmatchedCount: number;
    failedCount: number;
    duplicateNames?: string[];
    unmatchedNames?: string[];
  }): string {
    const segs: string[] = [];
    if (parts.duplicateCount > 0) {
      const sample = parts.duplicateNames?.slice(0, 3).join(', ');
      segs.push(
        `중복 ${parts.duplicateCount}건${sample ? ` (${sample}${(parts.duplicateNames?.length ?? 0) > 3 ? ' 외' : ''})` : ''}`,
      );
    }
    if (parts.unmatchedCount > 0) {
      const sample = parts.unmatchedNames?.slice(0, 3).join(', ');
      segs.push(
        `미매칭 ${parts.unmatchedCount}건${sample ? ` (${sample}${(parts.unmatchedNames?.length ?? 0) > 3 ? ' 외' : ''})` : ''}`,
      );
    }
    if (parts.failedCount > 0) segs.push(`실패 ${parts.failedCount}건`);
    return segs.length > 0 ? ` · ${segs.join(' · ')}` : '';
  }

  async function handleSubmit() {
    const ids = Array.from(selectedStudentIds);
    if (ids.length === 0 || !amount || !reason) {
      alert('학생, 점수, 사유를 모두 입력해주세요.');
      return;
    }
    if (pointType === 'penalty' && ids.length > 1) {
      alert('벌점은 한 명씩만 부여 가능합니다.');
      return;
    }
    const pointAmount = parseInt(amount);
    if (isNaN(pointAmount) || pointAmount < 1) {
      alert('올바른 점수를 입력해주세요.');
      return;
    }
    const hasNote = additionalNote.trim().length > 0;
    const finalReason = hasNote ? `${reason} - ${additionalNote.trim()}` : reason;
    // additionalNote 없음 + preset 매칭됨 → presetId 전달해 KST 일자 중복 차단 활성화.
    // additionalNote 있으면 자유 텍스트 의도이므로 중복 차단 미적용.
    const presetId = hasNote ? null : findPresetId(pointType, reason);
    setLoading(true);
    try {
      if (ids.length === 1) {
        const result = await givePoints(
          ids[0],
          pointType,
          pointAmount,
          finalReason,
          false,
          presetId,
        );
        if (result.error) {
          alert(result.error);
        } else if (result.success) {
          showSuccess(`${pointType === 'reward' ? '상점' : '벌점'} ${pointAmount}점 부여 완료`);
          resetForm();
          refreshData();
        }
        return;
      }
      // 다중 상점 일괄 부여
      const result = await giveRewardBatch({
        studentIds: ids,
        amount: pointAmount,
        reason: finalReason,
        presetId,
      });
      if (result.error) {
        alert(result.error);
        return;
      }
      const extras = formatBatchExtras(result);
      if (result.successCount === 0) {
        alert(`부여된 학생이 없습니다${extras}`);
        return;
      }
      showSuccess(`${result.successCount}명에게 상점 ${pointAmount}점 부여 완료${extras}`, 4000);
      resetForm();
      refreshData();
    } catch (e) {
      console.error('Failed to give points:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickGive(
    studentId: string,
    type: 'reward' | 'penalty',
    presetAmount: number,
    presetReason: string,
  ) {
    if (presetAmount === 999) {
      alert('이 항목은 제적 사유입니다. 별도로 처리해주세요.');
      return;
    }
    setLoading(true);
    try {
      const presetId = findPresetId(type, presetReason);
      const result = await givePoints(studentId, type, presetAmount, presetReason, false, presetId);
      if (result.error) {
        alert(result.error);
      } else if (result.success) {
        showSuccess(`${type === 'reward' ? '상점' : '벌점'} ${presetAmount}점 부여 완료`);
        refreshData();
      }
    } catch (e) {
      console.error('Failed to give points:', e);
    } finally {
      setLoading(false);
    }
  }

  // ── 단건 삭제 ───────────────────────────────────────────
  async function handleDeletePoint(pointId: string) {
    setLoading(true);
    try {
      const result = await deletePoint(pointId);
      if (result.success) {
        showSuccess('상벌점 내역이 삭제되었습니다. 점수가 원상복구됩니다.');
        setDeleteConfirmId(null);
        refreshData();
      } else {
        alert(result.error || '삭제에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to delete point:', e);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  // ── 다중 선택 (현재 페이지) ─────────────────────────────
  function toggleSelectPoint(pointId: string) {
    setSelectedPointIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(pointId)) newSet.delete(pointId);
      else newSet.add(pointId);
      return newSet;
    });
  }

  function toggleSelectAllOnPage() {
    if (selectedPointIds.size === history.length) {
      setSelectedPointIds(new Set());
    } else {
      setSelectedPointIds(new Set(history.map((h) => h.id)));
    }
  }

  function exitSelectMode() {
    setIsSelectMode(false);
    setSelectedPointIds(new Set());
    setShowBulkDeleteConfirm(false);
    setShowFilterDeleteConfirm(false);
  }

  async function handleBulkDelete() {
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
        refreshData();
      } else {
        alert(result.error || '삭제에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to delete points:', e);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setShowBulkDeleteConfirm(false);
    }
  }

  // ── 필터 결과 전체 삭제 ────────────────────────────────
  async function handleFilterDelete() {
    setLoading(true);
    try {
      const result = await deletePointsByFilter({
        type:
          historyTypeFilter === 'reward' || historyTypeFilter === 'penalty'
            ? historyTypeFilter
            : undefined,
        studentId: historyStudentFilter || undefined,
        q: historyQ || undefined,
      });
      if (result.success) {
        showSuccess(`${result.deletedCount}건이 삭제되었습니다.`);
        exitSelectMode();
        refreshData();
      } else {
        alert(result.error || '삭제에 실패했습니다.');
      }
    } catch (e) {
      console.error('Failed to delete by filter:', e);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setShowFilterDeleteConfirm(false);
    }
  }

  // ── 프리셋 ──────────────────────────────────────────────
  async function handleAddRewardPreset() {
    const presetAmount = parseInt(newRewardAmount);
    if (isNaN(presetAmount) || presetAmount < 1) {
      alert('올바른 점수를 입력하세요.');
      return;
    }
    if (!newRewardReason.trim()) {
      alert('사유를 입력하세요.');
      return;
    }
    if (!branchId) {
      alert('규정은 지점별로 관리됩니다. 지점이 지정된 어드민 화면에서 추가해 주세요.');
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
  }

  async function handleDeleteRewardPreset(id: string) {
    setLoading(true);
    const result = await deleteRewardPreset(id);
    if (result.success) {
      const presets = await getRewardPresets(branchId);
      setRewardPresets(presets);
      showSuccess('상점 규정 삭제 완료');
    }
    setLoading(false);
  }

  async function handleAddPenaltyPreset() {
    const presetAmount = parseInt(newPenaltyAmount);
    if (isNaN(presetAmount) || presetAmount < 1) {
      alert('올바른 점수를 입력하세요.');
      return;
    }
    if (!newPenaltyReason.trim()) {
      alert('사유를 입력하세요.');
      return;
    }
    if (!branchId) {
      alert('규정은 지점별로 관리됩니다. 지점이 지정된 어드민 화면에서 추가해 주세요.');
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
  }

  async function handleDeletePenaltyPreset(id: string) {
    setLoading(true);
    const result = await deletePenaltyPreset(id);
    if (result.success) {
      const presets = await getPenaltyPresets(branchId);
      setPenaltyPresets(presets);
      showSuccess('벌점 규정 삭제 완료');
    }
    setLoading(false);
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function handleOpenFormForStudent(studentId: string) {
    setSelectedStudentIds(new Set([studentId]));
    setStudentSearchText('');
    setPointType('reward');
    setAmount('1');
    setReason('');
    setAdditionalNote('');
    setShowAddForm(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  async function handleToggleStudentHistory(studentId: string) {
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null);
      return;
    }
    setExpandedStudentId(studentId);
    setExpandedHistoryPage(0);
    setExpandedLoading(true);
    try {
      const result = await getAllPointsHistory({
        branchId,
        page: 1,
        pageSize: 100,
        sort: 'created_at',
        dir: 'desc',
        studentId,
      });
      setExpandedHistory(result.rows);
    } catch (e) {
      console.error('Failed to load student history:', e);
      setExpandedHistory([]);
    } finally {
      setExpandedLoading(false);
    }
  }

  return (
    <div className='space-y-6 p-6'>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>상벌점 관리</h1>
          <p className='text-text-muted mt-1'>학생들의 상점과 벌점을 관리하세요</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' onClick={() => setShowPresetManager(!showPresetManager)}>
            <Settings className='mr-2 h-4 w-4' />
            규정 관리
          </Button>
          <Button variant='outline' onClick={refreshData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className='mr-2 h-4 w-4' />
            상벌점 부여
          </Button>
        </div>
      </div>

      {/* 성공 메시지 */}
      {successMessage && (
        <div className='animate-in slide-in-from-top fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl bg-green-100 px-4 py-2 text-green-800 shadow-lg'>
          <Check className='h-4 w-4' />
          {successMessage}
        </div>
      )}

      {/* 규정 관리 패널 */}
      {showPresetManager && (
        <Card className='border-2 border-dashed bg-gray-50 p-4'>
          <h3 className='mb-4 flex items-center gap-2 font-semibold'>
            <Settings className='h-4 w-4' />
            상벌점 규정 관리
          </h3>
          <div className='grid grid-cols-2 gap-6'>
            <div>
              <p className='mb-2 text-sm font-medium text-green-700'>상점 규정</p>
              <div className='mb-3 max-h-48 space-y-2 overflow-y-auto'>
                {rewardPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className='flex items-center justify-between rounded-lg border bg-white p-2'
                  >
                    <span className='text-sm'>{preset.reason}</span>
                    <div className='flex items-center gap-2'>
                      <span className='font-semibold text-green-600'>+{preset.amount}점</span>
                      <button
                        onClick={() => handleDeleteRewardPreset(preset.id)}
                        className='text-gray-400 hover:text-red-500'
                      >
                        <X className='h-4 w-4' />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className='flex gap-2'>
                <Input
                  type='number'
                  min='1'
                  placeholder='점수'
                  value={newRewardAmount}
                  onChange={(e) => setNewRewardAmount(e.target.value)}
                  className='w-20'
                />
                <Input
                  placeholder='규정 사유'
                  value={newRewardReason}
                  onChange={(e) => setNewRewardReason(e.target.value)}
                  className='flex-1'
                />
                <Button size='sm' onClick={handleAddRewardPreset} disabled={loading}>
                  <Plus className='h-4 w-4' />
                </Button>
              </div>
            </div>

            <div>
              <p className='mb-2 text-sm font-medium text-red-700'>벌점 규정</p>
              <div className='mb-3 max-h-48 space-y-2 overflow-y-auto'>
                {penaltyPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className='flex items-center justify-between rounded-lg border bg-white p-2'
                  >
                    <span className='text-sm'>{preset.reason}</span>
                    <div className='flex items-center gap-2'>
                      {preset.amount === 999 ? (
                        <span className='text-xs font-semibold text-gray-800'>이유 불문 제적</span>
                      ) : (
                        <span className='font-semibold text-red-500'>-{preset.amount}점</span>
                      )}
                      <button
                        onClick={() => handleDeletePenaltyPreset(preset.id)}
                        className='text-gray-400 hover:text-red-500'
                      >
                        <X className='h-4 w-4' />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className='flex gap-2'>
                <Input
                  type='number'
                  min='1'
                  placeholder='점수'
                  value={newPenaltyAmount}
                  onChange={(e) => setNewPenaltyAmount(e.target.value)}
                  className='w-20'
                />
                <Input
                  placeholder='규정 사유'
                  value={newPenaltyReason}
                  onChange={(e) => setNewPenaltyReason(e.target.value)}
                  className='flex-1'
                />
                <Button size='sm' onClick={handleAddPenaltyPreset} disabled={loading}>
                  <Plus className='h-4 w-4' />
                </Button>
              </div>
              <p className='mt-2 text-xs text-gray-500'>* 제적 항목은 점수를 999로 입력하세요</p>
            </div>
          </div>
        </Card>
      )}

      {/* 탭 */}
      <Tabs
        items={[
          { value: 'overview', label: '학생별 현황' },
          { value: 'history', label: '상벌점 내역' },
          { value: 'rules', label: '상벌점 규정' },
          {
            value: 'review',
            label: `퇴원 검토/강제 퇴원${
              initialReviewQueue.length + initialRequiredQueue.length > 0
                ? ` (${initialReviewQueue.length + initialRequiredQueue.length})`
                : ''
            }`,
          },
          {
            value: 'redemptions',
            label: `상품권 발급 대기${initialRedemptionQueue.length > 0 ? ` (${initialRedemptionQueue.length})` : ''}`,
          },
        ]}
        activeValue={activeTab}
        pathname={pathname}
        searchParams={new URLSearchParams(sp.toString())}
      />

      {/* 퇴원 검토/강제 퇴원 큐 탭 */}
      {activeTab === 'review' && (
        <WithdrawalReviewTab
          reviewQueue={initialReviewQueue}
          requiredQueue={initialRequiredQueue}
          onRefresh={refreshData}
        />
      )}

      {/* 상품권 발급 큐 탭 */}
      {activeTab === 'redemptions' && (
        <RedemptionQueueTab queue={initialRedemptionQueue} onRefresh={refreshData} />
      )}

      {/* 상벌점 부여 폼 */}
      {showAddForm && (
        <Card className='p-6'>
          <div className='mb-4 flex items-center justify-between'>
            <h2 className='text-lg font-semibold'>상벌점 부여</h2>
            <button onClick={resetForm} className='text-text-muted hover:text-text'>
              <X className='h-5 w-5' />
            </button>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {/* 학생 검색 — reward 는 다중, penalty 는 단건 토글 */}
            <div className='md:col-span-2 lg:col-span-2'>
              <div className='mb-2 flex items-center justify-between'>
                <label className='block text-sm font-medium'>
                  학생
                  {pointType === 'reward' && selectedStudentIds.size > 0 && (
                    <span className='text-text-muted ml-2 text-xs font-normal'>
                      선택 {selectedStudentIds.size}명
                    </span>
                  )}
                </label>
                {selectedStudentIds.size > 0 && (
                  <button
                    type='button'
                    onClick={clearSelectedStudents}
                    className='text-text-muted text-xs hover:text-gray-700'
                  >
                    전체 해제
                  </button>
                )}
              </div>
              <div className='relative'>
                <div
                  className={cn(
                    'focus-within:ring-primary/50 flex items-center rounded-xl border border-gray-200 px-3 py-2 focus-within:ring-2',
                    selectedStudentIds.size > 0 && 'border-primary/50 bg-primary/5',
                  )}
                >
                  <Search className='mr-2 h-4 w-4 flex-shrink-0 text-gray-400' />
                  <input
                    type='text'
                    value={studentSearchText}
                    onChange={(e) => {
                      setStudentSearchText(e.target.value);
                      setShowStudentDropdown(true);
                    }}
                    onFocus={() => setShowStudentDropdown(true)}
                    onBlur={() => setTimeout(() => setShowStudentDropdown(false), 150)}
                    placeholder={
                      pointType === 'reward' ? '이름 검색 (다중 선택)' : '이름 또는 좌석번호...'
                    }
                    className='flex-1 bg-transparent text-sm outline-none'
                  />
                  {studentSearchText && (
                    <button
                      type='button'
                      onClick={() => setStudentSearchText('')}
                      className='text-gray-400 hover:text-gray-600'
                    >
                      <X className='h-4 w-4' />
                    </button>
                  )}
                </div>
                {showStudentDropdown && (
                  <div className='absolute top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg'>
                    {filteredStudentsForSearch.length === 0 ? (
                      <div className='px-4 py-3 text-sm text-gray-500'>검색 결과 없음</div>
                    ) : (
                      filteredStudentsForSearch.map((student) => {
                        const checked = selectedStudentIds.has(student.id);
                        return (
                          <button
                            key={student.id}
                            type='button'
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              toggleSelectStudent(student.id);
                              if (pointType === 'penalty') {
                                setShowStudentDropdown(false);
                                setStudentSearchText('');
                              }
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-50',
                              checked && 'bg-primary/10',
                            )}
                          >
                            {pointType === 'reward' &&
                              (checked ? (
                                <CheckSquare className='text-primary h-4 w-4 flex-shrink-0' />
                              ) : (
                                <Square className='h-4 w-4 flex-shrink-0 text-gray-400' />
                              ))}
                            <span>
                              <span className='text-primary font-semibold'>
                                {student.seatNumber || '-'}번
                              </span>{' '}
                              {student.name}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              {selectedStudentIds.size > 0 && (
                <div className='mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto'>
                  {Array.from(selectedStudentIds).map((id) => {
                    const s = students.find((x) => x.id === id);
                    if (!s) return null;
                    return (
                      <span
                        key={id}
                        className='border-primary/30 bg-primary/5 text-primary inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs'
                      >
                        <span className='font-semibold'>{s.seatNumber || '-'}번</span>
                        <span>{s.name}</span>
                        <button
                          type='button'
                          onClick={() => toggleSelectStudent(id)}
                          className='hover:text-primary/70 ml-0.5'
                          aria-label={`${s.name} 선택 해제`}
                        >
                          <X className='h-3 w-3' />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 유형 선택 */}
            <div>
              <label className='mb-2 block text-sm font-medium'>유형</label>
              <div className='flex gap-2'>
                <Button
                  variant={pointType === 'reward' ? 'default' : 'outline'}
                  className={cn(
                    'flex-1',
                    pointType === 'reward' && 'bg-green-600 hover:bg-green-700',
                  )}
                  onClick={() => setPointTypeWithGuard('reward')}
                >
                  <Plus className='mr-1 h-4 w-4' />
                  상점
                </Button>
                <Button
                  variant={pointType === 'penalty' ? 'default' : 'outline'}
                  className={cn('flex-1', pointType === 'penalty' && 'bg-red-600 hover:bg-red-700')}
                  onClick={() => setPointTypeWithGuard('penalty')}
                >
                  <Minus className='mr-1 h-4 w-4' />
                  벌점
                </Button>
              </div>
            </div>

            {/* 점수 */}
            <div>
              <label className='mb-2 block text-sm font-medium'>점수</label>
              <Input
                type='number'
                min='1'
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder='점수'
              />
            </div>

            {/* 사유 선택 */}
            <div>
              <label className='mb-2 block text-sm font-medium'>사유</label>
              <select
                value={reason}
                onChange={(e) => {
                  const selectedValue = e.target.value;
                  setReason(selectedValue);
                  setAdditionalNote('');
                  const presets = pointType === 'reward' ? rewardPresets : penaltyPresets;
                  const selectedPreset = presets.find((p) => p.reason === selectedValue);
                  if (selectedPreset && selectedPreset.amount !== 999) {
                    setAmount(selectedPreset.amount.toString());
                  }
                }}
                className='focus:ring-primary/50 w-full rounded-xl border border-gray-200 px-4 py-2 focus:ring-2 focus:outline-none'
              >
                <option value=''>사유를 선택하세요</option>
                {(pointType === 'reward' ? rewardPresets : penaltyPresets).map((preset) => (
                  <option key={preset.id} value={preset.reason}>
                    {preset.reason} ({preset.amount === 999 ? '제적' : `${preset.amount}점`})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {reason && (
            <div className='mt-3'>
              <label className='mb-2 block text-sm font-medium'>
                세부 내용
                <span className='ml-1 font-normal text-gray-400'>(선택 사항)</span>
              </label>
              <Input
                value={additionalNote}
                onChange={(e) => setAdditionalNote(e.target.value)}
                placeholder={`예: ${reason}에 대한 구체적인 내용을 입력하세요`}
              />
            </div>
          )}

          <div className='mt-4 flex justify-end gap-2'>
            <Button variant='outline' onClick={resetForm}>
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
        <Card className='p-6'>
          <h2 className='mb-4 flex items-center gap-2 text-lg font-semibold'>
            <Award className='text-primary h-5 w-5' />
            학생별 상벌점 현황
          </h2>

          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='border-b border-gray-100 bg-gray-50'>
                <tr>
                  <th className='text-text-muted w-8 px-4 py-3 text-left text-sm font-medium'></th>
                  <th className='text-text-muted px-4 py-3 text-left text-sm font-medium'>
                    <button
                      onClick={() => handleOverviewSort('seatNumber')}
                      className='flex items-center gap-1 hover:text-gray-700'
                    >
                      좌석
                      <SortIcon
                        sortKey='seatNumber'
                        current={overviewSortKey}
                        dir={overviewSortDir}
                      />
                    </button>
                  </th>
                  <th className='text-text-muted px-4 py-3 text-left text-sm font-medium'>
                    <button
                      onClick={() => handleOverviewSort('name')}
                      className='flex items-center gap-1 hover:text-gray-700'
                    >
                      이름
                      <SortIcon sortKey='name' current={overviewSortKey} dir={overviewSortDir} />
                    </button>
                  </th>
                  <th className='px-4 py-3 text-center text-sm font-medium text-green-600'>
                    <button
                      onClick={() => handleOverviewSort('reward')}
                      className='flex w-full items-center justify-center gap-1 hover:text-green-800'
                    >
                      상점
                      <SortIcon sortKey='reward' current={overviewSortKey} dir={overviewSortDir} />
                    </button>
                  </th>
                  <th className='px-4 py-3 text-center text-sm font-medium text-red-500'>
                    <button
                      onClick={() => handleOverviewSort('penalty')}
                      className='flex w-full items-center justify-center gap-1 hover:text-red-700'
                    >
                      벌점
                      <SortIcon sortKey='penalty' current={overviewSortKey} dir={overviewSortDir} />
                    </button>
                  </th>
                  <th className='text-text-muted px-4 py-3 text-center text-sm font-medium'>
                    <button
                      onClick={() => handleOverviewSort('total')}
                      className='flex w-full items-center justify-center gap-1 hover:text-gray-700'
                    >
                      합계
                      <SortIcon sortKey='total' current={overviewSortKey} dir={overviewSortDir} />
                    </button>
                  </th>
                  <th className='text-text-muted px-4 py-3 text-center text-sm font-medium'>
                    액션
                  </th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {overview.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='text-text-muted px-4 py-8 text-center'>
                      등록된 학생이 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedOverview
                    .slice(
                      (overviewPageNum - 1) * OVERVIEW_PAGE_SIZE,
                      overviewPageNum * OVERVIEW_PAGE_SIZE,
                    )
                    .map((student) => {
                      const isExpanded = expandedStudentId === student.id;
                      const PAGE_SIZE = 5;
                      const totalPages = Math.ceil(expandedHistory.length / PAGE_SIZE);
                      const pagedHistory = expandedHistory.slice(
                        expandedHistoryPage * PAGE_SIZE,
                        (expandedHistoryPage + 1) * PAGE_SIZE,
                      );

                      return (
                        <Fragment key={student.id}>
                          <tr
                            className='cursor-pointer select-none hover:bg-gray-50'
                            onClick={() => handleToggleStudentHistory(student.id)}
                          >
                            <td className='text-text-muted px-4 py-3'>
                              {isExpanded ? (
                                <ChevronUp className='h-4 w-4' />
                              ) : (
                                <ChevronDown className='h-4 w-4' />
                              )}
                            </td>
                            <td className='px-4 py-3'>
                              <span className='text-primary font-medium'>
                                {student.seatNumber || '-'}
                              </span>
                            </td>
                            <td className='px-4 py-3'>
                              <div className='flex items-center gap-2'>
                                <div className='bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full'>
                                  <User className='text-primary h-4 w-4' />
                                </div>
                                <span>{student.name}</span>
                              </div>
                            </td>
                            <td className='px-4 py-3 text-center'>
                              <span className='font-medium text-green-600'>+{student.reward}</span>
                            </td>
                            <td className='px-4 py-3 text-center'>
                              <span className='font-medium text-red-500'>-{student.penalty}</span>
                            </td>
                            <td className='px-4 py-3 text-center'>
                              <span
                                className={cn(
                                  'font-semibold',
                                  student.total >= 0 ? 'text-green-600' : 'text-red-500',
                                )}
                              >
                                {student.total >= 0 ? '+' : ''}
                                {student.total}
                              </span>
                            </td>
                            <td className='px-4 py-3 text-center'>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenFormForStudent(student.id);
                                }}
                                className='text-primary border-primary/30 hover:bg-primary/10 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors'
                              >
                                <Plus className='h-3 w-3' />
                                부여
                              </button>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr key={`${student.id}-expanded`}>
                              <td
                                colSpan={7}
                                className='border-b border-gray-200 bg-gray-50 px-0 py-0'
                              >
                                <div className='px-6 py-4'>
                                  {expandedLoading ? (
                                    <div className='text-text-muted flex items-center justify-center gap-2 py-6 text-sm'>
                                      <RefreshCw className='h-4 w-4 animate-spin' />
                                      불러오는 중...
                                    </div>
                                  ) : expandedHistory.length === 0 ? (
                                    <p className='text-text-muted py-4 text-center text-sm'>
                                      상벌점 내역이 없습니다.
                                    </p>
                                  ) : (
                                    <>
                                      <div className='mb-3 space-y-2'>
                                        {pagedHistory.map((item) => (
                                          <div
                                            key={item.id}
                                            className={cn(
                                              'flex items-center justify-between rounded-lg border-l-4 px-4 py-2.5 text-sm',
                                              item.type === 'reward'
                                                ? 'border-green-400 bg-green-50'
                                                : 'border-red-400 bg-red-50',
                                            )}
                                          >
                                            <div className='flex items-center gap-3'>
                                              <div
                                                className={cn(
                                                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                                                  item.type === 'reward'
                                                    ? 'bg-green-100'
                                                    : 'bg-red-100',
                                                )}
                                              >
                                                {item.type === 'reward' ? (
                                                  <Plus className='h-3 w-3 text-green-600' />
                                                ) : (
                                                  <Minus className='h-3 w-3 text-red-500' />
                                                )}
                                              </div>
                                              <div>
                                                <div className='flex items-center gap-2'>
                                                  <span
                                                    className={cn(
                                                      'font-semibold',
                                                      item.type === 'reward'
                                                        ? 'text-green-700'
                                                        : 'text-red-600',
                                                    )}
                                                  >
                                                    {item.type === 'reward' ? '+' : '-'}
                                                    {item.amount}점
                                                  </span>
                                                  <span className='text-gray-700'>
                                                    {item.reason}
                                                  </span>
                                                  {item.is_auto && (
                                                    <span className='rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500'>
                                                      자동
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                            <div className='text-text-muted ml-4 flex-shrink-0 text-right text-xs'>
                                              <p>{formatDate(item.created_at)}</p>
                                              <p>by {item.adminName}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      {totalPages > 1 && (
                                        <div className='mt-2 flex items-center justify-center gap-3'>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedHistoryPage((p) => Math.max(0, p - 1));
                                            }}
                                            disabled={expandedHistoryPage === 0}
                                            className='rounded-lg p-1 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-30'
                                          >
                                            <ChevronLeft className='h-4 w-4' />
                                          </button>
                                          <span className='text-text-muted text-xs'>
                                            {expandedHistoryPage + 1} / {totalPages}
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedHistoryPage((p) =>
                                                Math.min(totalPages - 1, p + 1),
                                              );
                                            }}
                                            disabled={expandedHistoryPage >= totalPages - 1}
                                            className='rounded-lg p-1 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-30'
                                          >
                                            <ChevronRight className='h-4 w-4' />
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>

          <div className='mt-4 flex justify-center'>
            <Pagination
              total={sortedOverview.length}
              page={Math.min(
                overviewPageNum,
                Math.max(1, Math.ceil(sortedOverview.length / OVERVIEW_PAGE_SIZE)),
              )}
              pageSize={OVERVIEW_PAGE_SIZE}
              pathname={pathname}
              searchParams={new URLSearchParams(sp.toString())}
            />
          </div>
        </Card>
      )}

      {/* 상벌점 내역 탭 */}
      {activeTab === 'history' && (
        <Card className='p-6'>
          <div className='mb-4 flex flex-col gap-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>상벌점 내역 ({historyTotal}건)</h2>
              <div className='flex gap-2'>
                {!isSelectMode ? (
                  <Button variant='outline' size='sm' onClick={() => setIsSelectMode(true)}>
                    <CheckSquare className='mr-1 h-4 w-4' />
                    선택
                  </Button>
                ) : (
                  <>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={toggleSelectAllOnPage}
                      className={cn(
                        selectedPointIds.size > 0 &&
                          'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
                      )}
                    >
                      {selectedPointIds.size === history.length && history.length > 0 ? (
                        <>
                          <CheckSquare className='mr-1 h-4 w-4' />
                          페이지 해제
                        </>
                      ) : (
                        <>
                          <Square className='mr-1 h-4 w-4' />이 페이지 전체
                        </>
                      )}
                    </Button>
                    <Button
                      variant='danger'
                      size='sm'
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      disabled={selectedPointIds.size === 0}
                      className='border-red-500 bg-red-500 hover:bg-red-600'
                    >
                      <Trash2 className='mr-1 h-4 w-4' />
                      선택 삭제 ({selectedPointIds.size})
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setShowFilterDeleteConfirm(true)}
                      disabled={historyTotal === 0}
                      className='border-red-300 text-red-600 hover:bg-red-50'
                    >
                      <Trash2 className='mr-1 h-4 w-4' />
                      필터 결과 전체 삭제 ({historyTotal})
                    </Button>
                    <Button variant='ghost' size='sm' onClick={exitSelectMode}>
                      취소
                    </Button>
                  </>
                )}
              </div>
            </div>

            <DataTableToolbar
              searchPlaceholder='사유 또는 학생 이름으로 검색...'
              filters={[
                {
                  key: 'type',
                  label: '유형',
                  options: [
                    { value: 'reward', label: '상점' },
                    { value: 'penalty', label: '벌점' },
                  ],
                },
                {
                  key: 'studentId',
                  label: '학생',
                  options: students.map((s) => ({
                    value: s.id,
                    label: `${s.seatNumber || '-'}번 ${s.name}`,
                  })),
                },
              ]}
            >
              <div className='ml-2 flex items-center gap-1'>
                <span className='text-text-muted mr-1 text-xs'>정렬:</span>
                {(
                  [
                    { key: 'created_at', label: '날짜' },
                    { key: 'amount', label: '점수' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => handleHistorySort(key)}
                    className={cn(
                      'inline-flex items-center gap-0.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                      historySort === key
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    )}
                  >
                    {label}
                    <SortIcon sortKey={key} current={historySort} dir={historyDir} small />
                  </button>
                ))}
              </div>
            </DataTableToolbar>
          </div>

          {/* 일괄 삭제 확인 — 선택된 ID */}
          {showBulkDeleteConfirm && (
            <div className='mb-4 rounded-xl border border-red-300 bg-red-100 p-4'>
              <div className='flex items-center gap-3'>
                <AlertTriangle className='h-5 w-5 flex-shrink-0 text-red-500' />
                <div className='flex-1'>
                  <p className='font-medium text-red-800'>
                    선택한 {selectedPointIds.size}건의 상벌점 내역을 삭제하시겠습니까?
                  </p>
                  <p className='mt-1 text-sm text-red-600'>
                    삭제된 내역의 점수는 모두 원상복구됩니다.
                  </p>
                </div>
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    onClick={handleBulkDelete}
                    disabled={loading}
                    className='bg-red-500 text-white hover:bg-red-600'
                  >
                    {loading ? '삭제 중...' : '삭제'}
                  </Button>
                  <Button variant='ghost' size='sm' onClick={() => setShowBulkDeleteConfirm(false)}>
                    취소
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 필터 결과 전체 삭제 확인 */}
          {showFilterDeleteConfirm && (
            <div className='mb-4 rounded-xl border border-red-300 bg-red-100 p-4'>
              <div className='flex items-center gap-3'>
                <AlertTriangle className='h-5 w-5 flex-shrink-0 text-red-500' />
                <div className='flex-1'>
                  <p className='font-medium text-red-800'>
                    현재 필터 조건의 {historyTotal}건을 모두 삭제하시겠습니까?
                  </p>
                  <p className='mt-1 text-sm text-red-600'>
                    페이지에 보이지 않는 항목까지 모두 삭제됩니다. 점수는 원상복구됩니다.
                  </p>
                </div>
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    onClick={handleFilterDelete}
                    disabled={loading}
                    className='bg-red-500 text-white hover:bg-red-600'
                  >
                    {loading ? '삭제 중...' : '전체 삭제'}
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setShowFilterDeleteConfirm(false)}
                  >
                    취소
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className='space-y-3'>
            {history.length === 0 ? (
              <p className='text-text-muted py-8 text-center'>내역이 없습니다.</p>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-xl border-l-4 p-4',
                    item.type === 'reward'
                      ? 'border-green-500 bg-green-50'
                      : 'border-red-500 bg-red-50',
                    isSelectMode &&
                      selectedPointIds.has(item.id) &&
                      'ring-primary ring-2 ring-offset-1',
                  )}
                  onClick={isSelectMode ? () => toggleSelectPoint(item.id) : undefined}
                  style={isSelectMode ? { cursor: 'pointer' } : undefined}
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      {isSelectMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectPoint(item.id);
                          }}
                          className='flex-shrink-0'
                        >
                          {selectedPointIds.has(item.id) ? (
                            <CheckSquare className='text-primary h-5 w-5' />
                          ) : (
                            <Square className='h-5 w-5 text-gray-400' />
                          )}
                        </button>
                      )}
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full',
                          item.type === 'reward' ? 'bg-green-100' : 'bg-red-100',
                        )}
                      >
                        {item.type === 'reward' ? (
                          <Plus className='h-4 w-4 text-green-600' />
                        ) : (
                          <Minus className='h-4 w-4 text-red-500' />
                        )}
                      </div>
                      <div>
                        <div className='flex items-center gap-2'>
                          <span className='font-medium'>
                            {item.studentSeatNumber || '-'}번 {item.studentName}
                          </span>
                          <span
                            className={cn(
                              'text-sm font-semibold',
                              item.type === 'reward' ? 'text-green-600' : 'text-red-500',
                            )}
                          >
                            {item.type === 'reward' ? '+' : '-'}
                            {item.amount}점
                          </span>
                          {item.is_auto && (
                            <span className='rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600'>
                              자동
                            </span>
                          )}
                        </div>
                        <p className='text-text-muted text-sm'>{item.reason}</p>
                      </div>
                    </div>
                    <div className='flex items-center gap-3'>
                      <div className='text-right'>
                        <p className='text-text-muted text-sm'>{formatDate(item.created_at)}</p>
                        <p className='text-text-muted text-xs'>by {item.adminName}</p>
                      </div>
                      {!isSelectMode &&
                        (deleteConfirmId === item.id ? (
                          <div className='flex items-center gap-1'>
                            <Button
                              size='sm'
                              onClick={() => handleDeletePoint(item.id)}
                              disabled={loading}
                              className='border-0 bg-red-500 text-xs text-white hover:bg-red-600'
                            >
                              삭제
                            </Button>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => setDeleteConfirmId(null)}
                              className='bg-white text-xs'
                            >
                              취소
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            className='rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500'
                            title='삭제 (점수 원상복구)'
                          >
                            <Trash2 className='h-4 w-4' />
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 페이지네이션 */}
          <div className='mt-4 flex justify-center'>
            <Pagination
              total={historyTotal}
              page={historyPage}
              pageSize={historyPageSize}
              pathname={pathname}
              searchParams={new URLSearchParams(sp.toString())}
            />
          </div>
        </Card>
      )}

      {/* 상벌점 규정 탭 */}
      {activeTab === 'rules' && (
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <Card className='p-6'>
            <h2 className='mb-4 text-lg font-semibold text-green-700'>상점 규정</h2>
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead className='border-b border-green-100 bg-green-50'>
                  <tr>
                    <th className='px-4 py-3 text-left text-sm font-medium text-green-700'>
                      상점 규정
                    </th>
                    <th className='w-24 px-4 py-3 text-center text-sm font-medium text-green-700'>
                      상점
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-green-50'>
                  {rewardPresets.length === 0 ? (
                    <tr>
                      <td colSpan={2} className='text-text-muted px-4 py-8 text-center'>
                        등록된 상점 규정이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    rewardPresets.map((preset) => (
                      <tr key={preset.id} className='hover:bg-green-50/50'>
                        <td className='px-4 py-3'>{preset.reason}</td>
                        <td className='px-4 py-3 text-center'>
                          <span className='font-semibold text-green-600'>{preset.amount}점</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className='p-6'>
            <h2 className='mb-4 text-lg font-semibold text-red-700'>벌점 규정</h2>
            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead className='border-b border-red-100 bg-red-50'>
                  <tr>
                    <th className='px-4 py-3 text-left text-sm font-medium text-red-700'>
                      벌점 규정
                    </th>
                    <th className='w-32 px-4 py-3 text-center text-sm font-medium text-red-700'>
                      벌점
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-red-50'>
                  {penaltyPresets.length === 0 ? (
                    <tr>
                      <td colSpan={2} className='text-text-muted px-4 py-8 text-center'>
                        등록된 벌점 규정이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    penaltyPresets.map((preset) => (
                      <tr key={preset.id} className='hover:bg-red-50/50'>
                        <td className='px-4 py-3'>
                          <div className='flex items-center gap-2'>
                            {preset.amount === 999 && (
                              <AlertTriangle className='h-4 w-4 text-gray-700' />
                            )}
                            {preset.reason}
                          </div>
                        </td>
                        <td className='px-4 py-3 text-center'>
                          {preset.amount === 999 ? (
                            <span className='text-sm font-semibold text-gray-800'>
                              이유 불문 제적
                            </span>
                          ) : (
                            <span className='font-semibold text-red-500'>{preset.amount}점</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className='mt-4 flex items-center gap-1 text-xs text-gray-500'>
              <AlertTriangle className='h-3 w-3' />
              해당 항목은 사유에 따라 벌점의 부과 여부가 결정됩니다.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
