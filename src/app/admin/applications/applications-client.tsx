'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { cn, getTodayKST } from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import { buildListHref } from '@/lib/list-params';
import {
  exportUnifiedApplicationsForAdmin,
  type UnifiedAppDomain,
  type UnifiedAppPage,
  type UnifiedAppRow,
  type UnifiedAppStatus,
} from '@/lib/actions/unified-applications';
import { formatSeatMovedNote, formatSeatSnapshot } from '@/lib/seat-display';

const DOMAIN_LABEL: Record<UnifiedAppDomain, string> = {
  meal: '급식',
  exam: '모의고사',
  mentoring: '멘토링',
};

const STATUS_LABEL: Record<UnifiedAppStatus, string> = {
  pending: '신청 대기',
  completed: '완료',
  cancelled: '취소',
  rejected: '거절',
  refunded: '환불',
  failed: '실패',
  unknown: '기타',
};

const STATUS_BADGE_CLASS: Record<UnifiedAppStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-700',
  rejected: 'bg-rose-100 text-rose-800',
  refunded: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  unknown: 'bg-slate-100 text-slate-700',
};

const DOMAIN_BADGE_CLASS: Record<UnifiedAppDomain, string> = {
  meal: 'bg-orange-100 text-orange-800',
  exam: 'bg-violet-100 text-violet-800',
  mentoring: 'bg-cyan-100 text-cyan-800',
};

const MEAL_SUBCATEGORY_LABEL: Record<string, string> = {
  lunch: '중식',
  dinner: '석식',
};

interface InitialFilters {
  domain?: UnifiedAppDomain;
  status?: UnifiedAppStatus;
  mealType?: 'lunch' | 'dinner';
  branchId?: string;
  fromDate: string;
  toDate: string;
  q: string;
}

interface BranchOption {
  id: string;
  name: string;
}

type SortField =
  | 'applied_at'
  | 'amount'
  | 'service_start_date'
  | 'seat_number_snapshot'
  | 'item_name'
  | 'student_name';
type SortDir = 'asc' | 'desc';
type MealTypeFilter = 'lunch' | 'dinner' | 'all';

interface Props {
  initialResult: UnifiedAppPage;
  initialFilters: InitialFilters;
  branches: BranchOption[];
  isSuperAdmin: boolean;
  sort: SortField;
  dir: SortDir;
}

const DOMAIN_TABS: { key: UnifiedAppDomain | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'meal', label: '급식' },
  { key: 'exam', label: '모의고사' },
  { key: 'mentoring', label: '멘토링' },
];

// 급식·모의고사는 결제 성립 건만 노출되어 'failed' 가 view 에 없고(미결제 숨김), 멘토링은 failed 로
// 정규화되지 않으므로 '실패' 탭은 항상 0건이라 제외한다. 'pending'(신청 대기)은 멘토링 승인 대기 조회용으로 유지.
const STATUS_TABS: { key: UnifiedAppStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '신청 대기' },
  { key: 'completed', label: '완료' },
  { key: 'cancelled', label: '취소' },
  { key: 'rejected', label: '거절' },
  { key: 'refunded', label: '환불' },
];

const MEAL_TYPE_TABS: { key: MealTypeFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'lunch', label: MEAL_SUBCATEGORY_LABEL.lunch },
  { key: 'dinner', label: MEAL_SUBCATEGORY_LABEL.dinner },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `${amount.toLocaleString('ko-KR')}원`;
}

function formatServiceDate(row: UnifiedAppRow): string {
  const start = row.service_start_date;
  const end = row.service_end_date;
  if (!start) return '—';
  if (row.domain === 'mentoring') {
    const st = row.service_start_time;
    const et = row.service_end_time;
    return st && et ? `${start} ${trimSeconds(st)}~${trimSeconds(et)}` : start;
  }
  return start === end ? start : `${start} ~ ${end}`;
}

function trimSeconds(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function formatServiceDateForExcel(row: UnifiedAppRow): string {
  const s = row.service_start_date;
  const e = row.service_end_date;
  if (!s) return '';
  if (row.domain === 'mentoring') return s;
  return s === e ? s : `${s} ~ ${e}`;
}

function formatServiceTimeForExcel(row: UnifiedAppRow): string {
  if (row.domain !== 'mentoring') return '';
  const st = row.service_start_time;
  const et = row.service_end_time;
  if (!st || !et) return '';
  return `${trimSeconds(st)}~${trimSeconds(et)}`;
}

function describeSubCategory(domain: UnifiedAppDomain, raw: string | null): string {
  if (!raw) return '';
  if (domain === 'meal') return MEAL_SUBCATEGORY_LABEL[raw] ?? raw;
  if (domain === 'mentoring') {
    return MENTORING_TYPE_LABEL[raw as keyof typeof MENTORING_TYPE_LABEL] ?? raw;
  }
  return '';
}

function statusToText(s: UnifiedAppStatus): string {
  return STATUS_LABEL[s] ?? s;
}

export function ApplicationsClient({
  initialResult,
  initialFilters,
  branches,
  isSuperAdmin,
  sort,
  dir,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [local, setLocal] = useState<{
    domain: UnifiedAppDomain | 'all';
    status: UnifiedAppStatus | 'all';
    mealType: MealTypeFilter;
    branchId: string;
    fromDate: string;
    toDate: string;
    q: string;
  }>({
    domain: initialFilters.domain ?? 'all',
    status: initialFilters.status ?? 'all',
    mealType: initialFilters.mealType ?? 'all',
    branchId: initialFilters.branchId ?? '',
    fromDate: initialFilters.fromDate,
    toDate: initialFilters.toDate,
    q: initialFilters.q,
  });

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function pushFilters(next: Partial<typeof local>): void {
    const merged = { ...local, ...next };
    // 급식 식수 필터는 급식 도메인에서만 유효. 다른 도메인으로 바뀌면 자동 해제.
    // (머지 후 실효 도메인 merged.domain 기준으로 판정해야 식수 pill 클릭이 안 지워진다.)
    if (merged.domain !== 'meal') merged.mealType = 'all';
    setLocal(merged);
    const trimmedQ = merged.q.trim();
    // 현재 URL 기준 patch — sort/dir/size 는 자연 보존. page 는 필터 변경 시 1로 리셋.
    const href = buildListHref(pathname, new URLSearchParams(searchParams.toString()), {
      domain: merged.domain === 'all' ? null : merged.domain,
      status: merged.status === 'all' ? null : merged.status,
      mealType: merged.mealType === 'all' ? null : merged.mealType,
      branchId: merged.branchId || null,
      from: merged.fromDate || null,
      to: merged.toDate || null,
      q: trimmedQ || null,
      page: null,
    });
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function applyFromInputs(): void {
    pushFilters({});
  }

  function resetAll(): void {
    setLocal({
      domain: 'all',
      status: 'all',
      mealType: 'all',
      branchId: '',
      fromDate: '',
      toDate: '',
      q: '',
    });
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  function handleSort(field: SortField): void {
    const nextDir: SortDir = sort === field ? (dir === 'asc' ? 'desc' : 'asc') : 'asc';
    const href = buildListHref(pathname, new URLSearchParams(searchParams.toString()), {
      sort: field,
      dir: nextDir,
      page: null,
    });
    startTransition(() => router.replace(href, { scroll: false }));
  }

  function renderSortIcon(field: SortField) {
    if (sort !== field) return <ChevronsUpDown className='h-3 w-3 text-gray-300' />;
    return dir === 'asc' ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />;
  }

  async function handleExport(): Promise<void> {
    setExportError(null);
    setExporting(true);
    try {
      const trimmedQ = local.q.trim();
      const { rows, truncated } = await exportUnifiedApplicationsForAdmin({
        domain: local.domain === 'all' ? undefined : local.domain,
        status: local.status === 'all' ? undefined : local.status,
        mealType: local.mealType === 'all' ? undefined : local.mealType,
        branchId: isSuperAdmin && local.branchId ? local.branchId : undefined,
        fromDate: local.fromDate || undefined,
        toDate: local.toDate || undefined,
        q: trimmedQ || undefined,
        sort,
        dir,
      });
      if (rows.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
      }
      await downloadXlsx(rows);
      if (truncated) {
        alert('데이터가 50,000건을 초과하여 일부만 내보냈습니다. 필터를 좁혀 다시 시도해 주세요.');
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '엑셀 내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  }

  const rows = initialResult.rows;
  const total = initialResult.total;
  const page = initialResult.page;
  const pageSize = initialResult.pageSize;

  return (
    <div className='space-y-6'>
      <Card className='space-y-4 p-4'>
        <div className='flex flex-wrap gap-2'>
          {DOMAIN_TABS.map((t) => (
            <button
              key={t.key}
              type='button'
              onClick={() => pushFilters({ domain: t.key })}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                local.domain === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className='flex flex-wrap gap-2'>
          <span className='text-muted-foreground self-center text-xs'>상태:</span>
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type='button'
              onClick={() => pushFilters({ status: t.key })}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                local.status === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {local.domain === 'meal' && (
          <div className='flex flex-wrap gap-2'>
            <span className='text-muted-foreground self-center text-xs'>식사:</span>
            {MEAL_TYPE_TABS.map((t) => (
              <button
                key={t.key}
                type='button'
                onClick={() => pushFilters({ mealType: t.key })}
                className={cn(
                  'rounded-full px-3 py-1 text-sm',
                  local.mealType === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <label className='space-y-1 text-sm'>
            <span className='text-muted-foreground'>이용일 From</span>
            <input
              type='date'
              className='border-input w-full rounded-xl border px-3 py-2'
              value={local.fromDate}
              onChange={(e) => setLocal((s) => ({ ...s, fromDate: e.target.value }))}
            />
          </label>
          <label className='space-y-1 text-sm'>
            <span className='text-muted-foreground'>이용일 To</span>
            <input
              type='date'
              className='border-input w-full rounded-xl border px-3 py-2'
              value={local.toDate}
              onChange={(e) => setLocal((s) => ({ ...s, toDate: e.target.value }))}
            />
          </label>
          <label className='space-y-1 text-sm sm:col-span-2'>
            <span className='text-muted-foreground'>학생 검색 (이름·전화)</span>
            <input
              className='border-input w-full rounded-xl border px-3 py-2'
              placeholder='이름 또는 전화번호 일부'
              value={local.q}
              onChange={(e) => setLocal((s) => ({ ...s, q: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFromInputs();
              }}
            />
          </label>
          {isSuperAdmin && (
            <label className='space-y-1 text-sm sm:col-span-2'>
              <span className='text-muted-foreground'>지점</span>
              <select
                className='border-input w-full rounded-xl border px-3 py-2'
                value={local.branchId}
                onChange={(e) => setLocal((s) => ({ ...s, branchId: e.target.value }))}
              >
                <option value=''>전체 지점</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button type='button' onClick={applyFromInputs} disabled={isPending}>
            필터 적용
          </Button>
          <Button type='button' variant='outline' onClick={resetAll} disabled={isPending}>
            초기화
          </Button>
          <div className='ml-auto flex items-center gap-2'>
            {exportError && <span className='text-destructive text-xs'>{exportError}</span>}
            <Button type='button' variant='outline' onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  다운로드 중…
                </>
              ) : (
                <>
                  <Download className='mr-2 h-4 w-4' />
                  엑셀 다운로드
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      <Card className='overflow-hidden'>
        <div className='border-b px-4 py-2 text-sm'>
          <span className='text-muted-foreground'>결과: </span>
          <span className='font-semibold'>{total.toLocaleString('ko-KR')}건</span>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 text-muted-foreground'>
              <tr>
                <th
                  className='hover:bg-muted cursor-pointer px-3 py-2 text-left font-medium whitespace-nowrap transition-colors select-none'
                  onClick={() => handleSort('applied_at')}
                >
                  <div className='flex items-center gap-0.5'>
                    신청일
                    {renderSortIcon('applied_at')}
                  </div>
                </th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>도메인</th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>상태</th>
                <th
                  className='hover:bg-muted cursor-pointer px-3 py-2 text-left font-medium whitespace-nowrap transition-colors select-none'
                  onClick={() => handleSort('seat_number_snapshot')}
                >
                  <div className='flex items-center gap-0.5'>
                    좌석
                    {renderSortIcon('seat_number_snapshot')}
                  </div>
                </th>
                <th
                  className='hover:bg-muted cursor-pointer px-3 py-2 text-left font-medium whitespace-nowrap transition-colors select-none'
                  onClick={() => handleSort('student_name')}
                >
                  <div className='flex items-center gap-0.5'>
                    학생
                    {renderSortIcon('student_name')}
                  </div>
                </th>
                <th
                  className='hover:bg-muted cursor-pointer px-3 py-2 text-left font-medium whitespace-nowrap transition-colors select-none'
                  onClick={() => handleSort('item_name')}
                >
                  <div className='flex items-center gap-0.5'>
                    내역
                    {renderSortIcon('item_name')}
                  </div>
                </th>
                <th
                  className='hover:bg-muted cursor-pointer px-3 py-2 text-left font-medium whitespace-nowrap transition-colors select-none'
                  onClick={() => handleSort('service_start_date')}
                >
                  <div className='flex items-center gap-0.5'>
                    이용일자
                    {renderSortIcon('service_start_date')}
                  </div>
                </th>
                <th
                  className='hover:bg-muted cursor-pointer px-3 py-2 text-right font-medium whitespace-nowrap transition-colors select-none'
                  onClick={() => handleSort('amount')}
                >
                  <div className='flex items-center justify-end gap-0.5'>
                    금액
                    {renderSortIcon('amount')}
                  </div>
                </th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>결제일</th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>상세</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className='text-muted-foreground px-3 py-8 text-center'>
                    조건에 맞는 신청 내역이 없습니다.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <ApplicationRow key={`${r.domain}-${r.application_id}`} row={r} />
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex justify-center border-t px-4 py-3'>
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            pathname={pathname}
            searchParams={searchParams}
          />
        </div>
      </Card>
    </div>
  );
}

function ApplicationRow({ row }: { row: UnifiedAppRow }) {
  const subText = describeSubCategory(row.domain, row.sub_category);
  const itemDisplay = row.item_name
    ? subText
      ? `${row.item_name} · ${subText}`
      : row.item_name
    : subText || '-';
  const optionSummary = row.domain === 'exam' ? row.option_summary : null;

  return (
    <tr className='border-t'>
      <td className='px-3 py-2 align-top whitespace-nowrap'>{formatDateTime(row.applied_at)}</td>
      <td className='px-3 py-2 align-top whitespace-nowrap'>
        <span className={cn('rounded-full px-2 py-0.5 text-xs', DOMAIN_BADGE_CLASS[row.domain])}>
          {DOMAIN_LABEL[row.domain]}
        </span>
      </td>
      <td className='px-3 py-2 align-top whitespace-nowrap'>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs',
            STATUS_BADGE_CLASS[row.status_normalized],
          )}
        >
          {statusToText(row.status_normalized)}
        </span>
      </td>
      <td className='px-3 py-2 align-top text-xs whitespace-nowrap'>
        {formatSeatSnapshot(row.seat_number_snapshot, row.student_seat_number_current)}
      </td>
      <td className='px-3 py-2 align-top'>
        <div className='font-medium whitespace-nowrap'>
          {row.student_name ?? '—'}
          {row.student_withdrawn_at && (
            <span className='ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-600'>퇴원</span>
          )}
        </div>
        <div className='text-muted-foreground text-xs whitespace-nowrap'>
          {row.branch_name ?? '—'}
          {row.user_name && row.user_name !== row.student_name ? ` · 신청자 ${row.user_name}` : ''}
        </div>
      </td>
      <td className='px-3 py-2 align-top'>
        <div>{itemDisplay}</div>
        {optionSummary ? (
          <div className='text-muted-foreground mt-0.5 text-xs'>옵션: {optionSummary}</div>
        ) : null}
      </td>
      <td className='px-3 py-2 align-top text-xs whitespace-nowrap'>{formatServiceDate(row)}</td>
      <td className='px-3 py-2 text-right align-top whitespace-nowrap'>
        {formatAmount(row.amount)}
      </td>
      <td className='px-3 py-2 align-top whitespace-nowrap'>{formatDateTime(row.paid_at)}</td>
      <td className='px-3 py-2 align-top whitespace-nowrap'>
        <Link
          href={row.detail_href}
          className='text-primary inline-flex items-center gap-1 text-xs hover:underline'
          title={
            row.domain === 'mentoring'
              ? '슬롯 상세 페이지로 이동'
              : '상품의 신청 현황 페이지로 이동'
          }
        >
          상세 <ExternalLink className='h-3 w-3' />
        </Link>
      </td>
    </tr>
  );
}

/**
 * meta.option_selections (exam 도메인) 을 { group_name: option_name } 맵으로 평탄화.
 * view 에서 meta.option_selections 는 [{ group_id, group_name, option_id, option_name }] 형태.
 * 복수 선택 그룹은 같은 group_name 이 여러 번 등장하므로, ", " 로 이어붙여 유실을 방지한다.
 */
function extractOptionSelectionsMap(row: UnifiedAppRow): Record<string, string> {
  if (row.domain !== 'exam') return {};
  const raw = (row.meta as Record<string, unknown>).option_selections;
  if (!Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const item of raw) {
    if (item && typeof item === 'object') {
      const groupName = (item as Record<string, unknown>).group_name;
      const optionName = (item as Record<string, unknown>).option_name;
      if (typeof groupName === 'string' && typeof optionName === 'string') {
        out[groupName] = out[groupName] ? `${out[groupName]}, ${optionName}` : optionName;
      }
    }
  }
  return out;
}

async function downloadXlsx(rows: UnifiedAppRow[]): Promise<void> {
  // 1) 전체 rows 를 한 번 훑어 등장하는 모든 옵션 그룹명을 수집 (등장 순서 유지).
  const optionGroupNames: string[] = [];
  const seenGroupNames = new Set<string>();
  const perRowOptions: Record<string, string>[] = rows.map((r) => {
    const map = extractOptionSelectionsMap(r);
    for (const name of Object.keys(map)) {
      if (!seenGroupNames.has(name)) {
        seenGroupNames.add(name);
        optionGroupNames.push(name);
      }
    }
    return map;
  });

  // 2) 행마다 그룹 컬럼을 동적으로 펼쳐서 시트 작성.
  const sheet = rows.map((r, idx) => {
    const optionMap = perRowOptions[idx];
    const optionCols: Record<string, string> = {};
    for (const name of optionGroupNames) {
      optionCols[name] = optionMap[name] ?? '';
    }
    return {
      신청일: formatDateTime(r.applied_at),
      도메인: DOMAIN_LABEL[r.domain],
      상태: statusToText(r.status_normalized),
      상태원본: r.status_raw,
      지점: r.branch_name ?? '',
      // 좌석은 숫자 컬럼으로 분리해 엑셀에서 숫자 정렬이 되도록 한다(배식 좌석순 정렬).
      // null 은 빈 셀로 둬야 컬럼 전체가 텍스트로 인식되지 않는다.
      좌석: r.seat_number_snapshot ?? '',
      좌석비고: formatSeatMovedNote(r.seat_number_snapshot, r.student_seat_number_current),
      학생: r.student_name ?? '',
      학생전화: r.student_phone ?? '',
      퇴원여부: r.student_withdrawn_at ? '퇴원' : '',
      신청자: r.user_name ?? '',
      내역: r.item_name ?? '',
      세부유형: describeSubCategory(r.domain, r.sub_category),
      ...optionCols,
      이용일자: formatServiceDateForExcel(r),
      이용시간: formatServiceTimeForExcel(r),
      금액: r.amount ?? '',
      결제일: formatDateTime(r.paid_at),
      취소사유:
        ((r.meta as Record<string, unknown>).cancel_reason as string | null | undefined) ?? '',
      거절사유:
        ((r.meta as Record<string, unknown>).reject_reason as string | null | undefined) ?? '',
    };
  });

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sheet);
  if (sheet.length > 0) {
    const colWidths = Object.keys(sheet[0]).map((key) => ({
      wch: Math.max(
        key.length * 2,
        ...sheet.map((row) => String((row as Record<string, unknown>)[key] ?? '').length * 1.2),
      ),
    }));
    ws['!cols'] = colWidths;
  }
  XLSX.utils.book_append_sheet(wb, ws, '통합신청내역');
  XLSX.writeFile(wb, `통합신청내역_${getTodayKST()}.xlsx`);
}
