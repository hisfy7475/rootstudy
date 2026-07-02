'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Paperclip } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cancelMentoringApplication } from '@/lib/actions/mentoring';
import { mentoringSlotStartMs, type MentoringApplicationWithDetails } from '@/lib/mentoring-utils';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { handleNativeAttachmentClick } from '@/lib/native-bridge';

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
  // 슬롯 시작 시각이 지나면 "신청 취소" 버튼이 자동으로 사라지도록 30초마다 시각 갱신.
  // 렌더 중에 Date.now()를 직접 호출하면 react-hooks/purity 위반.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
          : a,
      ),
    );
    setCancelId(null);
    setReason('');
    router.refresh();
  }

  return (
    <div className='space-y-4 pb-8'>
      <div className='flex flex-wrap gap-2'>
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
            type='button'
            onClick={() => setTab(k)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className='text-muted-foreground p-6 text-center text-sm'>내역이 없습니다.</Card>
      ) : (
        <ul className='space-y-3'>
          {filtered.map((a) => {
            const slotJoin = a.mentoring_slots;
            const mentor = slotJoin?.mentors;
            const mentorName = mentor?.name;
            const canCancel =
              (a.status === 'pending' || a.status === 'confirmed') &&
              slotJoin &&
              nowMs < mentoringSlotStartMs(slotJoin.date, slotJoin.start_time);

            return (
              <li key={a.id}>
                <Card className='p-4'>
                  <div className='flex items-start justify-between gap-2'>
                    <div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          a.status === 'confirmed' && 'bg-green-100 text-green-800',
                          a.status === 'pending' && 'bg-amber-100 text-amber-800',
                          (a.status === 'rejected' || a.status === 'cancelled') &&
                            'bg-muted text-muted-foreground',
                        )}
                      >
                        {statusLabel(a.status)}
                      </span>
                      {slotJoin && (
                        <span className='bg-muted ml-1 rounded-full px-2 py-0.5 text-xs'>
                          {MENTORING_TYPE_LABEL[slotJoin.type]}
                        </span>
                      )}
                      <p className='mt-2 font-medium'>
                        {mentorName ?? '멘토'}
                        {a.selected_subject ? ` · ${a.selected_subject}` : ''}
                      </p>
                      {slotJoin && (
                        <p className='text-muted-foreground mt-1 text-sm'>
                          {slotJoin.date} {slotJoin.start_time.slice(0, 5)} –{' '}
                          {slotJoin.end_time.slice(0, 5)}
                        </p>
                      )}
                      {a.student_profile?.name && (
                        <p className='text-muted-foreground mt-1 text-xs'>
                          대상: {a.student_profile.name}
                        </p>
                      )}
                      {a.content ? (
                        <p className='text-foreground/90 mt-2 text-sm whitespace-pre-wrap'>
                          {a.content}
                        </p>
                      ) : a.note ? (
                        <p className='text-muted-foreground mt-1 text-xs'>메모: {a.note}</p>
                      ) : null}
                      {Array.isArray(a.attachments) && a.attachments.length > 0 && (
                        <div className='mt-2 flex flex-wrap gap-2'>
                          {a.attachments.map((att, i) =>
                            att.mime_type?.startsWith('image/') ? (
                              <a
                                key={`${a.id}-att-${i}`}
                                href={att.url}
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={(e) => handleNativeAttachmentClick(e, att.url)}
                                className='bg-muted block size-16 overflow-hidden rounded-lg border'
                              >
                                <Image
                                  src={att.url}
                                  alt={att.name}
                                  width={64}
                                  height={64}
                                  unoptimized
                                  className='size-full object-cover'
                                />
                              </a>
                            ) : (
                              <a
                                key={`${a.id}-att-${i}`}
                                href={att.url}
                                target='_blank'
                                rel='noopener noreferrer'
                                onClick={(e) => handleNativeAttachmentClick(e, att.url)}
                                className='bg-muted hover:bg-muted/70 inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs'
                              >
                                <Paperclip className='size-3.5 flex-shrink-0' />
                                <span className='max-w-[160px] truncate'>{att.name}</span>
                              </a>
                            ),
                          )}
                        </div>
                      )}
                      {a.reject_reason && (
                        <p className='text-destructive mt-1 text-xs'>사유: {a.reject_reason}</p>
                      )}
                      {a.cancel_reason && (
                        <p className='text-muted-foreground mt-1 text-xs'>
                          취소 사유: {a.cancel_reason}
                        </p>
                      )}
                    </div>
                  </div>
                  {canCancel && (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='mt-3'
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
        <div className='pb-safe-nav fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4 sm:items-center sm:pb-4'>
          <Card className='w-full max-w-md space-y-3 p-4'>
            <h3 className='font-semibold'>신청 취소</h3>
            <p className='text-muted-foreground text-sm'>취소 사유를 입력해 주세요.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className='border-input bg-background min-h-[80px] w-full rounded-md border px-3 py-2 text-sm'
              placeholder='사유'
            />
            {err && <p className='text-destructive text-sm'>{err}</p>}
            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                variant='ghost'
                onClick={() => {
                  setCancelId(null);
                  setErr(null);
                }}
                disabled={busy}
              >
                닫기
              </Button>
              <Button type='button' onClick={confirmCancel} disabled={busy}>
                취소 확정
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
