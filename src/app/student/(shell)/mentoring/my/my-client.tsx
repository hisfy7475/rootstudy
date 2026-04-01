'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  cancelMentoringApplication,
  mentoringSlotStartMs,
  type MentoringApplicationWithDetails,
} from '@/lib/actions/mentoring';
import { cn } from '@/lib/utils';

type Tab = 'all' | 'pending' | 'confirmed' | 'ended';

function statusLabel(s: MentoringApplicationWithDetails['status']): string {
  switch (s) {
    case 'pending':
      return '대기';
    case 'confirmed':
      return '확정';
    case 'rejected':
      return '거절';
    case 'cancelled':
      return '취소';
    default:
      return s;
  }
}

function typeLabel(t: 'mentoring' | 'clinic'): string {
  return t === 'clinic' ? '클리닉' : '멘토링';
}

export function MentoringMyClient({
  initialApplications,
}: {
  initialApplications: MentoringApplicationWithDetails[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState(initialApplications);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    if (tab === 'pending') return items.filter((a) => a.status === 'pending');
    if (tab === 'confirmed') return items.filter((a) => a.status === 'confirmed');
    return items.filter((a) => a.status === 'rejected' || a.status === 'cancelled');
  }, [items, tab]);

  async function confirmCancel() {
    if (!cancelId) return;
    setErr(null);
    setBusy(true);
    const r = await cancelMentoringApplication(cancelId, reason);
    setBusy(false);
    if (r.error) {
      setErr(r.error);
      return;
    }
    setItems((prev) =>
      prev.map((a) =>
        a.id === cancelId
          ? {
              ...a,
              status: 'cancelled' as const,
              cancelled_at: new Date().toISOString(),
              cancel_reason: reason,
            }
          : a
      )
    );
    setCancelId(null);
    setReason('');
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', '전체'],
            ['pending', '대기'],
            ['confirmed', '확정'],
            ['ended', '취소·거절'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">내역이 없습니다.</Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((a) => {
            const slotJoin = a.mentoring_slots;
            const mentor = slotJoin?.mentors;
            const mentorName = mentor?.name;
            const canCancel =
              (a.status === 'pending' || a.status === 'confirmed') &&
              slotJoin &&
              Date.now() <
                mentoringSlotStartMs(
                  slotJoin.date,
                  slotJoin.start_time
                );

            return (
              <li key={a.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          a.status === 'confirmed' && 'bg-green-100 text-green-800',
                          a.status === 'pending' && 'bg-amber-100 text-amber-800',
                          (a.status === 'rejected' || a.status === 'cancelled') &&
                            'bg-muted text-muted-foreground'
                        )}
                      >
                        {statusLabel(a.status)}
                      </span>
                      {slotJoin && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted ml-1">
                          {typeLabel(slotJoin.type)}
                        </span>
                      )}
                      <p className="font-medium mt-2">
                        {mentorName ?? '멘토'} · {slotJoin?.subject ?? mentor?.subject ?? ''}
                      </p>
                      {slotJoin && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {slotJoin.date} {slotJoin.start_time.slice(0, 5)} –{' '}
                          {slotJoin.end_time.slice(0, 5)}
                        </p>
                      )}
                      {a.student_profile?.name && (
                        <p className="text-xs text-muted-foreground mt-1">
                          대상: {a.student_profile.name}
                        </p>
                      )}
                      {a.note && (
                        <p className="text-xs text-muted-foreground mt-1">메모: {a.note}</p>
                      )}
                      {a.reject_reason && (
                        <p className="text-xs text-destructive mt-1">사유: {a.reject_reason}</p>
                      )}
                      {a.cancel_reason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          취소 사유: {a.cancel_reason}
                        </p>
                      )}
                    </div>
                  </div>
                  {canCancel && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setCancelId(a.id);
                        setReason('');
                        setErr(null);
                      }}
                    >
                      신청 취소
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-4 space-y-3">
            <h3 className="font-semibold">신청 취소</h3>
            <p className="text-sm text-muted-foreground">취소 사유를 입력해 주세요.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="사유"
            />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCancelId(null);
                  setErr(null);
                }}
                disabled={busy}
              >
                닫기
              </Button>
              <Button type="button" onClick={confirmCancel} disabled={busy}>
                취소 확정
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
