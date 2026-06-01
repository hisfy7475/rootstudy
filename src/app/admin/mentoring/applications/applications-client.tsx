'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import type { MentoringType } from '@/types/database';
import {
  type AdminMentoringApplicationRow,
  type AdminMentoringApplicationFilters,
  confirmMentoringApplication,
  rejectMentoringApplication,
  adminCancelMentoringApplication,
  saveMentoringResult,
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

export function AdminMentoringApplicationsClient({ initialRows, initialFilters, today }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});
  const [resultNote, setResultNote] = useState<Record<string, string>>({});
  const [resultEditing, setResultEditing] = useState<Record<string, boolean>>({});
  // 상담/멘토링 레터 전송 확인 모달 대상 신청 id (null이면 닫힘)
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);

  const [local, setLocal] = useState<{
    fromDate: string;
    toDate: string;
    q: string;
    status: NonNullable<AdminMentoringApplicationFilters['status']>;
    type: NonNullable<AdminMentoringApplicationFilters['type']>;
  }>({
    fromDate: initialFilters.fromDate ?? '',
    toDate: initialFilters.toDate ?? '',
    q: initialFilters.studentSearch ?? '',
    status: initialFilters.status ?? 'all',
    type: initialFilters.type ?? 'all',
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
    if (local.type && local.type !== 'all') p.set('type', local.type);
    router.push(`/admin/mentoring/applications?${p.toString()}`);
  }

  function confirmApp(appId: string) {
    setError(null);
    startTransition(async () => {
      const res = await confirmMentoringApplication(appId);
      if (res.error) setError(res.error);
      else {
        setRows((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'confirmed' as const } : a)),
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
          prev.map((a) => (a.id === appId ? { ...a, status: 'rejected' as const } : a)),
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
          prev.map((a) => (a.id === appId ? { ...a, status: 'cancelled' as const } : a)),
        );
        router.refresh();
      }
    });
  }

  // [결과 저장] 클릭 → 내용 검증 후 전송 확인 모달을 띄운다.
  function requestSaveResult(appId: string) {
    const note = (resultNote[appId] ?? '').trim();
    if (!note) {
      setError('상담 결과 내용을 입력해 주세요.');
      return;
    }
    setError(null);
    setConfirmSendId(appId);
  }

  // 모달에서 [전송] 확정 시 실제 저장. 최초 저장이면 학생·학부모에게 알림이 발송된다.
  function confirmSaveResult() {
    const appId = confirmSendId;
    if (!appId) return;
    const note = (resultNote[appId] ?? '').trim();
    if (!note) {
      setConfirmSendId(null);
      return;
    }
    startTransition(async () => {
      const res = await saveMentoringResult(appId, note);
      if (res.error) setError(res.error);
      else {
        setRows((prev) => prev.map((a) => (a.id === appId ? { ...a, result_note: note } : a)));
        setResultEditing((s) => ({ ...s, [appId]: false }));
        router.refresh();
      }
      setConfirmSendId(null);
    });
  }

  return (
    <div className='space-y-6'>
      <Card className='space-y-4 p-4'>
        <div className='flex flex-wrap gap-2'>
          {statusTabs.map((t) => (
            <button
              key={String(t.key)}
              type='button'
              onClick={() => {
                setLocal((s) => ({ ...s, status: t.key }));
              }}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                local.status === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-xs'>유형:</span>
          {(
            [
              ['all', '전체'],
              ['mentoring', '멘토링'],
              ['clinic', '클리닉'],
              ['consult', '상담'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type='button'
              onClick={() => setLocal((s) => ({ ...s, type: v }))}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                local.type === v ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <label className='space-y-1 text-sm'>
            <span className='text-muted-foreground'>슬롯 날짜 From</span>
            <input
              type='date'
              className='border-input w-full rounded-xl border px-3 py-2'
              value={local.fromDate}
              onChange={(e) => setLocal((s) => ({ ...s, fromDate: e.target.value }))}
            />
          </label>
          <label className='space-y-1 text-sm'>
            <span className='text-muted-foreground'>슬롯 날짜 To</span>
            <input
              type='date'
              className='border-input w-full rounded-xl border px-3 py-2'
              value={local.toDate}
              onChange={(e) => setLocal((s) => ({ ...s, toDate: e.target.value }))}
            />
          </label>
          <label className='space-y-1 text-sm sm:col-span-2'>
            <span className='text-muted-foreground'>학생 이름 검색</span>
            <input
              className='border-input w-full rounded-xl border px-3 py-2'
              placeholder='이름 일부'
              value={local.q}
              onChange={(e) => setLocal((s) => ({ ...s, q: e.target.value }))}
            />
          </label>
        </div>
        <button
          type='button'
          onClick={applyFilters}
          className='bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium'
        >
          필터 적용
        </button>
        <p className='text-muted-foreground text-xs'>오늘(KST): {today}</p>
      </Card>

      {error && <p className='text-destructive text-sm'>{error}</p>}

      <Card className='overflow-x-auto'>
        <table className='w-full min-w-[720px] text-sm'>
          <thead className='bg-muted/50 border-b text-left'>
            <tr>
              <th className='p-3 font-medium'>날짜·시간</th>
              <th className='p-3 font-medium'>학생</th>
              <th className='p-3 font-medium'>신청자</th>
              <th className='p-3 font-medium'>멘토·과목</th>
              <th className='p-3 font-medium'>상태</th>
              <th className='p-3 font-medium'>처리</th>
              <th className='p-3 font-medium'>상담 결과</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className='text-muted-foreground p-6 text-center'>
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
                  <tr key={a.id} className='border-b last:border-0'>
                    <td className='p-3'>
                      <div>{slot?.date ?? '—'}</div>
                      <div className='text-muted-foreground text-xs'>{timeStr}</div>
                    </td>
                    <td className='p-3'>{a.student_name}</td>
                    <td className='p-3'>{a.applicant_name}</td>
                    <td className='p-3'>
                      <div>
                        {slot?.mentors?.name ?? '—'}
                        {slot?.type && (
                          <span className='text-muted-foreground ml-1 text-xs'>
                            [{MENTORING_TYPE_LABEL[slot.type as MentoringType]}]
                          </span>
                        )}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {a.selected_subject ?? slot?.subject ?? '—'}
                      </div>
                    </td>
                    <td className='p-3'>{String(a.status)}</td>
                    <td className='space-y-2 p-3'>
                      <Link
                        href={`/admin/mentoring?view=month&slot=${a.slot_id}`}
                        className='text-primary block text-xs hover:underline'
                      >
                        슬롯 상세
                      </Link>
                      {a.status === 'pending' && (
                        <>
                          <button
                            type='button'
                            disabled={pending}
                            onClick={() => confirmApp(a.id)}
                            className='bg-primary text-primary-foreground mr-2 rounded px-2 py-1 text-xs'
                          >
                            확정
                          </button>
                          <input
                            placeholder='거절 사유'
                            className='border-input mb-1 w-full max-w-[140px] rounded border px-1 py-0.5 text-xs'
                            value={rejectReason[a.id] ?? ''}
                            onChange={(e) =>
                              setRejectReason((r) => ({ ...r, [a.id]: e.target.value }))
                            }
                          />
                          <button
                            type='button'
                            disabled={pending}
                            onClick={() => rejectApp(a.id)}
                            className='rounded border px-2 py-1 text-xs'
                          >
                            거절
                          </button>
                        </>
                      )}
                      {(a.status === 'pending' || a.status === 'confirmed') && (
                        <div className='pt-1'>
                          <input
                            placeholder='강제 취소 사유'
                            className='border-input mb-1 w-full max-w-[160px] rounded border px-1 py-0.5 text-xs'
                            value={cancelReason[a.id] ?? ''}
                            onChange={(e) =>
                              setCancelReason((r) => ({ ...r, [a.id]: e.target.value }))
                            }
                          />
                          <button
                            type='button'
                            disabled={pending}
                            onClick={() => cancelApp(a.id)}
                            className='bg-muted rounded px-2 py-1 text-xs'
                          >
                            강제 취소
                          </button>
                        </div>
                      )}
                    </td>
                    <td className='p-3 align-top'>
                      {a.status !== 'confirmed' ? (
                        <span className='text-muted-foreground text-xs'>확정 후 입력</span>
                      ) : resultEditing[a.id] || !a.result_note ? (
                        <div className='space-y-1'>
                          <textarea
                            placeholder='상담 결과 내용'
                            rows={2}
                            className='border-input w-full min-w-[180px] rounded border px-2 py-1 text-xs'
                            value={resultNote[a.id] ?? a.result_note ?? ''}
                            onChange={(e) =>
                              setResultNote((r) => ({ ...r, [a.id]: e.target.value }))
                            }
                          />
                          <button
                            type='button'
                            disabled={pending}
                            onClick={() => requestSaveResult(a.id)}
                            className='bg-primary text-primary-foreground rounded px-2 py-1 text-xs'
                          >
                            결과 저장
                          </button>
                        </div>
                      ) : (
                        <div className='space-y-1'>
                          <p className='text-text max-w-[220px] text-xs whitespace-pre-wrap'>
                            {a.result_note}
                          </p>
                          <button
                            type='button'
                            onClick={() => {
                              setResultNote((r) => ({ ...r, [a.id]: a.result_note ?? '' }));
                              setResultEditing((s) => ({ ...s, [a.id]: true }));
                            }}
                            className='rounded border px-2 py-1 text-xs'
                          >
                            수정
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

      <ConfirmDialog
        open={confirmSendId !== null}
        title='상담/멘토링 레터를 전송하시겠습니까?'
        description={
          confirmSendId && !rows.find((a) => a.id === confirmSendId)?.result_note
            ? '전송하면 학생과 학부모에게 알림이 발송됩니다.'
            : undefined
        }
        confirmText='전송'
        cancelText='취소'
        loading={pending}
        onConfirm={confirmSaveResult}
        onCancel={() => setConfirmSendId(null)}
      />
    </div>
  );
}
