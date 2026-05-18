'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { cn, getTodayKST } from '@/lib/utils';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import {
  exportUnifiedApplicationsForAdmin,
  type UnifiedAppDomain,
  type UnifiedAppPage,
  type UnifiedAppRow,
  type UnifiedAppStatus,
} from '@/lib/actions/unified-applications';
import { formatSeatSnapshot } from '@/lib/seat-display';

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
  branchId?: string;
  fromDate: string;
  toDate: string;
  q: string;
}

interface BranchOption {
  id: string;
  name: string;
}

interface Props {
  initialResult: UnifiedAppPage;
  initialFilters: InitialFilters;
  branches: BranchOption[];
  isSuperAdmin: boolean;
}

const DOMAIN_TABS: { key: UnifiedAppDomain | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'meal', label: '급식' },
  { key: 'exam', label: '모의고사' },
  { key: 'mentoring', label: '멘토링' },
];

const STATUS_TABS: { key: UnifiedAppStatus | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '신청 대기' },
  { key: 'completed', label: '완료' },
  { key: 'cancelled', label: '취소' },
  { key: 'rejected', label: '거절' },
  { key: 'refunded', label: '환불' },
  { key: 'failed', label: '실패' },
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
  const m = row.meta as Record<string, unknown>;
  if (row.domain === 'mentoring') {
    const d = m.slot_date as string | null | undefined;
    return d ?? '—';
  }
  const start = m.product_start_date as string | null | undefined;
  const end = m.product_end_date as string | null | undefined;
  if (!start || !end) return '—';
  return start === end ? start : `${start} ~ ${end}`;
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
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [local, setLocal] = useState<{
    domain: UnifiedAppDomain | 'all';
    status: UnifiedAppStatus | 'all';
    branchId: string;
    fromDate: string;
    toDate: string;
    q: string;
  }>({
    domain: initialFilters.domain ?? 'all',
    status: initialFilters.status ?? 'all',
    branchId: initialFilters.branchId ?? '',
    fromDate: initialFilters.fromDate,
    toDate: initialFilters.toDate,
    q: initialFilters.q,
  });

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function pushFilters(next: Partial<typeof local>): void {
    const merged = { ...local, ...next };
    setLocal(merged);
    const p = new URLSearchParams();
    if (merged.domain !== 'all') p.set('domain', merged.domain);
    if (merged.status !== 'all') p.set('status', merged.status);
    if (merged.branchId) p.set('branchId', merged.branchId);
    if (merged.fromDate) p.set('from', merged.fromDate);
    if (merged.toDate) p.set('to', merged.toDate);
    const trimmedQ = merged.q.trim();
    if (trimmedQ) p.set('q', trimmedQ);
    // page 는 필터 변경 시 1로 리셋. size 는 유지.
    const size = searchParams.get('size');
    if (size) p.set('size', size);
    startTransition(() => {
      router.push(p.toString() ? `${pathname}?${p.toString()}` : pathname);
    });
  }

  function applyFromInputs(): void {
    pushFilters({});
  }

  function resetAll(): void {
    setLocal({
      domain: 'all',
      status: 'all',
      branchId: '',
      fromDate: '',
      toDate: '',
      q: '',
    });
    startTransition(() => {
      router.push(pathname);
    });
  }

  async function handleExport(): Promise<void> {
    setExportError(null);
    setExporting(true);
    try {
      const sortParam = (searchParams.get('sort') as 'applied_at' | 'amount') ?? 'applied_at';
      const dirParam = (searchParams.get('dir') as 'asc' | 'desc') ?? 'desc';
      const trimmedQ = local.q.trim();
      const { rows, truncated } = await exportUnifiedApplicationsForAdmin({
        domain: local.domain === 'all' ? undefined : local.domain,
        status: local.status === 'all' ? undefined : local.status,
        branchId: isSuperAdmin && local.branchId ? local.branchId : undefined,
        fromDate: local.fromDate || undefined,
        toDate: local.toDate || undefined,
        q: trimmedQ || undefined,
        sort: sortParam,
        dir: dirParam,
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
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <label className='space-y-1 text-sm'>
            <span className='text-muted-foreground'>신청일 From</span>
            <input
              type='date'
              className='border-input w-full rounded-xl border px-3 py-2'
              value={local.fromDate}
              onChange={(e) => setLocal((s) => ({ ...s, fromDate: e.target.value }))}
            />
          </label>
          <label className='space-y-1 text-sm'>
            <span className='text-muted-foreground'>신청일 To</span>
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
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>신청일</th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>도메인</th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>상태</th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>좌석</th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>학생</th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>내역</th>
                <th className='px-3 py-2 text-left font-medium whitespace-nowrap'>이용일자</th>
                <th className='px-3 py-2 text-right font-medium whitespace-nowrap'>금액</th>
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
      <td className='px-3 py-2 align-top'>{itemDisplay}</td>
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

async function downloadXlsx(rows: UnifiedAppRow[]): Promise<void> {
  const sheet = rows.map((r) => ({
    신청일: formatDateTime(r.applied_at),
    도메인: DOMAIN_LABEL[r.domain],
    상태: statusToText(r.status_normalized),
    상태원본: r.status_raw,
    지점: r.branch_name ?? '',
    좌석: formatSeatSnapshot(r.seat_number_snapshot, r.student_seat_number_current),
    학생: r.student_name ?? '',
    학생전화: r.student_phone ?? '',
    퇴원여부: r.student_withdrawn_at ? '퇴원' : '',
    신청자: r.user_name ?? '',
    내역: r.item_name ?? '',
    세부유형: describeSubCategory(r.domain, r.sub_category),
    이용일자: formatServiceDate(r),
    금액: r.amount ?? '',
    결제일: formatDateTime(r.paid_at),
    취소사유:
      ((r.meta as Record<string, unknown>).cancel_reason as string | null | undefined) ?? '',
    거절사유:
      ((r.meta as Record<string, unknown>).reject_reason as string | null | undefined) ?? '',
  }));

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
