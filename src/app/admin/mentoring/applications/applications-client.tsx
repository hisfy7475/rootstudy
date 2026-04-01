'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  type AdminMentoringApplicationRow,
  type AdminMentoringApplicationFilters,
  confirmMentoringApplication,
  rejectMentoringApplication,
  adminCancelMentoringApplication,
} from '@/lib/actions/mentoring';

interface Props {
  initialRows: AdminMentoringApplicationRow[];
  initialFilters: AdminMentoringApplicationFilters;
  today: string;
}

const statusTabs: {
  key: NonNullable<AdminMentoringApplicationFilters['status']>;
  label: string;
}[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'confirmed', label: '확정' },
  { key: 'rejected', label: '거절' },
  { key: 'cancelled', label: '취소' },
];

export function AdminMentoringApplicationsClient({
  initialRows,
  initialFilters,
  today,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});

  const [local, setLocal] = useState({
    fromDate: initialFilters.fromDate ?? '',
    toDate: initialFilters.toDate ?? '',
    q: initialFilters.studentSearch ?? '',
    status: initialFilters.status ?? 'all',
  });

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  function applyFilters() {
    const p = new URLSearchParams();
    if (local.fromDate) p.set('from', local.fromDate);
    if (local.toDate) p.set('to', local.toDate);
    if (local.q.trim()) p.set('q', local.q.trim());
    if (local.status && local.status !== 'all') p.set('status', local.status);
    router.push(`/admin/mentoring/applications?${p.toString()}`);
  }

  function confirmApp(appId: string) {
    setError(null);
    startTransition(async () => {
      const res = await confirmMentoringApplication(appId);
      if (res.error) setError(res.error);
      else {
        setRows((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'confirmed' as const } : a))
        );
        router.refresh();
      }
    });
  }

  function rejectApp(appId: string) {
    const reason = (rejectReason[appId] ?? '').trim();
    if (!reason) {
      setError('거절 사유를 입력해 주세요.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await rejectMentoringApplication(appId, reason);
      if (res.error) setError(res.error);
      else {
        setRows((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'rejected' as const } : a))
        );
        router.refresh();
      }
    });
  }

  function cancelApp(appId: string) {
    const reason = (cancelReason[appId] ?? '').trim();
    if (!reason) {
      setError('취소 사유를 입력해 주세요.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await adminCancelMentoringApplication(appId, reason);
      if (res.error) setError(res.error);
      else {
        setRows((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'cancelled' as const } : a))
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {statusTabs.map((t) => (
            <button
              key={String(t.key)}
              type="button"
              onClick={() => {
                setLocal((s) => ({ ...s, status: t.key }));
              }}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                local.status === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">슬롯 날짜 From</span>
            <input
              type="date"
              className="border-input w-full rounded-xl border px-3 py-2"
              value={local.fromDate}
              onChange={(e) => setLocal((s) => ({ ...s, fromDate: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">슬롯 날짜 To</span>
            <input
              type="date"
              className="border-input w-full rounded-xl border px-3 py-2"
              value={local.toDate}
              onChange={(e) => setLocal((s) => ({ ...s, toDate: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">학생 이름 검색</span>
            <input
              className="border-input w-full rounded-xl border px-3 py-2"
              placeholder="이름 일부"
              value={local.q}
              onChange={(e) => setLocal((s) => ({ ...s, q: e.target.value }))}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          필터 적용
        </button>
        <p className="text-muted-foreground text-xs">오늘(KST): {today}</p>
      </Card>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 border-b text-left">
            <tr>
              <th className="p-3 font-medium">날짜·시간</th>
              <th className="p-3 font-medium">학생</th>
              <th className="p-3 font-medium">신청자</th>
              <th className="p-3 font-medium">멘토·과목</th>
              <th className="p-3 font-medium">상태</th>
              <th className="p-3 font-medium">처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground p-6 text-center">
                  내역이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((a) => {
                const slot = a.mentoring_slots;
                const timeStr =
                  slot &&
                  `${String(slot.start_time).slice(0, 5)}–${String(slot.end_time).slice(0, 5)}`;
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="p-3">
                      <div>{slot?.date ?? '—'}</div>
                      <div className="text-muted-foreground text-xs">{timeStr}</div>
                    </td>
                    <td className="p-3">{a.student_name}</td>
                    <td className="p-3">{a.applicant_name}</td>
                    <td className="p-3">
                      <div>{slot?.mentors?.name ?? '—'}</div>
                      <div className="text-muted-foreground text-xs">
                        {slot?.subject ?? slot?.type ?? '—'}
                      </div>
                    </td>
                    <td className="p-3">{String(a.status)}</td>
                    <td className="space-y-2 p-3">
                      <Link
                        href={`/admin/mentoring/slots/${a.slot_id}`}
                        className="text-primary block text-xs hover:underline"
                      >
                        슬롯 상세
                      </Link>
                      {a.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => confirmApp(a.id)}
                            className="mr-2 rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                          >
                            확정
                          </button>
                          <input
                            placeholder="거절 사유"
                            className="border-input mb-1 w-full max-w-[140px] rounded border px-1 py-0.5 text-xs"
                            value={rejectReason[a.id] ?? ''}
                            onChange={(e) =>
                              setRejectReason((r) => ({ ...r, [a.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => rejectApp(a.id)}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            거절
                          </button>
                        </>
                      )}
                      {(a.status === 'pending' || a.status === 'confirmed') && (
                        <div className="pt-1">
                          <input
                            placeholder="강제 취소 사유"
                            className="border-input mb-1 w-full max-w-[160px] rounded border px-1 py-0.5 text-xs"
                            value={cancelReason[a.id] ?? ''}
                            onChange={(e) =>
                              setCancelReason((r) => ({ ...r, [a.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => cancelApp(a.id)}
                            className="rounded bg-muted px-2 py-1 text-xs"
                          >
                            강제 취소
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
