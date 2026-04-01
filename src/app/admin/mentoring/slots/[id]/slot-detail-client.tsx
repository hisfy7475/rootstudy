'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import type { Mentor, MentoringSlot } from '@/types/database';
import {
  updateMentoringSlot,
  deleteMentoringSlot,
  confirmMentoringApplication,
  rejectMentoringApplication,
  adminCancelMentoringApplication,
  type AdminMentoringApplicationRow,
  type MentoringSlotAdminInput,
} from '@/lib/actions/mentoring';
import { cn } from '@/lib/utils';

interface Props {
  slot: MentoringSlot & { mentors: Mentor | null };
  initialApplications: AdminMentoringApplicationRow[];
  mentors: Mentor[];
}

const statusLabel: Record<string, string> = {
  pending: '대기',
  confirmed: '확정',
  rejected: '거절',
  cancelled: '취소',
};

export function AdminSlotDetailClient({ slot, initialApplications, mentors }: Props) {
  const router = useRouter();
  const [applications, setApplications] = useState(initialApplications);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});

  const [form, setForm] = useState<Partial<MentoringSlotAdminInput>>({
    mentor_id: slot.mentor_id,
    date: slot.date,
    start_time: String(slot.start_time).slice(0, 5),
    end_time: String(slot.end_time).slice(0, 5),
    type: slot.type,
    subject: slot.subject ?? '',
    capacity: slot.capacity,
    location: slot.location ?? '',
    note: slot.note ?? '',
    is_active: slot.is_active,
  });

  function saveSlot() {
    setError(null);
    startTransition(async () => {
      const res = await updateMentoringSlot(slot.id, {
        mentor_id: form.mentor_id,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        type: form.type,
        subject: form.subject,
        capacity: form.capacity,
        location: form.location,
        note: form.note,
        is_active: form.is_active,
      });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function removeSlot() {
    if (!confirm('신청이 없을 때만 삭제됩니다. 삭제할까요?')) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteMentoringSlot(slot.id);
      if (res.error) setError(res.error);
      else router.push('/admin/mentoring');
    });
  }

  function confirmApp(appId: string) {
    setError(null);
    startTransition(async () => {
      const res = await confirmMentoringApplication(appId);
      if (res.error) setError(res.error);
      else {
        setApplications((prev) =>
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
        setApplications((prev) =>
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
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'cancelled' as const } : a))
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-destructive text-sm">{error}</p>}

      <Card className="space-y-4 p-4">
        <h2 className="font-semibold">슬롯 수정</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">멘토</span>
            <select
              className="border-input w-full rounded-xl border px-3 py-2"
              value={form.mentor_id}
              onChange={(e) => setForm((f) => ({ ...f, mentor_id: e.target.value }))}
            >
              {mentors.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.is_active}>
                  {m.name} {!m.is_active ? '(비활성)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">날짜</span>
            <input
              type="date"
              className="border-input w-full rounded-xl border px-3 py-2"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">시작</span>
            <input
              type="time"
              className="border-input w-full rounded-xl border px-3 py-2"
              value={String(form.start_time).slice(0, 5)}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">종료</span>
            <input
              type="time"
              className="border-input w-full rounded-xl border px-3 py-2"
              value={String(form.end_time).slice(0, 5)}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">유형</span>
            <select
              className="border-input w-full rounded-xl border px-3 py-2"
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as 'mentoring' | 'clinic' }))
              }
            >
              <option value="mentoring">멘토링</option>
              <option value="clinic">클리닉</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">정원</span>
            <input
              type="number"
              min={1}
              className="border-input w-full rounded-xl border px-3 py-2"
              value={form.capacity}
              onChange={(e) =>
                setForm((f) => ({ ...f, capacity: Number(e.target.value) || 1 }))
              }
            />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">과목</span>
          <input
            className="border-input w-full rounded-xl border px-3 py-2"
            value={form.subject ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">장소</span>
          <input
            className="border-input w-full rounded-xl border px-3 py-2"
            value={form.location ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">비고</span>
          <textarea
            className="border-input min-h-[60px] w-full rounded-xl border px-3 py-2"
            value={form.note ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active ?? true}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          활성
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={saveSlot}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            저장
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={removeSlot}
            className="text-destructive rounded-xl border border-red-300 px-4 py-2 text-sm dark:border-red-800"
          >
            삭제
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          신청 {slot.booked_count}/{slot.capacity} · 삭제는 신청 내역이 없을 때만 가능합니다.
        </p>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-semibold">신청자 ({applications.length})</h2>
        <div className="space-y-4">
          {applications.length === 0 ? (
            <p className="text-muted-foreground text-sm">신청이 없습니다.</p>
          ) : (
            applications.map((a) => (
              <div key={a.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{a.student_name}</span>
                    <span className="text-muted-foreground"> — 신청자: {a.applicant_name}</span>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      a.status === 'pending' && 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
                      a.status === 'confirmed' && 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950',
                      a.status === 'rejected' && 'bg-red-100 text-red-900 dark:bg-red-950',
                      a.status === 'cancelled' && 'bg-muted'
                    )}
                  >
                    {statusLabel[a.status] ?? a.status}
                  </span>
                </div>
                {a.note && <p className="text-muted-foreground mt-1 text-xs">메모: {a.note}</p>}
                {a.reject_reason && (
                  <p className="text-muted-foreground mt-1 text-xs">거절 사유: {a.reject_reason}</p>
                )}
                {a.status === 'pending' && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => confirmApp(a.id)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                    >
                      확정
                    </button>
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <input
                        placeholder="거절 사유"
                        className="border-input min-w-[140px] flex-1 rounded-lg border px-2 py-1 text-xs"
                        value={rejectReason[a.id] ?? ''}
                        onChange={(e) =>
                          setRejectReason((r) => ({ ...r, [a.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => rejectApp(a.id)}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 dark:border-red-800 dark:text-red-300"
                      >
                        거절
                      </button>
                    </div>
                  </div>
                )}
                {(a.status === 'pending' || a.status === 'confirmed') && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      placeholder="관리자 취소 사유"
                      className="border-input min-w-[160px] flex-1 rounded-lg border px-2 py-1 text-xs"
                      value={cancelReason[a.id] ?? ''}
                      onChange={(e) =>
                        setCancelReason((r) => ({ ...r, [a.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => cancelApp(a.id)}
                      className="rounded-lg bg-muted px-3 py-1.5 text-xs"
                    >
                      강제 취소
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
