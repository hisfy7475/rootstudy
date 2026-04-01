'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { applyMentoring, type MentoringSlotWithMentor } from '@/lib/actions/mentoring';
import { Button } from '@/components/ui/button';

function typeLabel(t: MentoringSlotWithMentor['type']): string {
  return t === 'clinic' ? '클리닉' : '멘토링';
}

export function MentoringApplyClient({
  slot,
  studentId,
  backHref,
}: {
  slot: MentoringSlotWithMentor;
  studentId: string;
  backHref: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await applyMentoring(slot.id, studentId, note || null);
      if (r.error) {
        setErr(r.error);
        setLoading(false);
        return;
      }
      router.push(backHref.includes('/parent/') ? '/parent/mentoring/my' : '/student/mentoring/my');
    } catch {
      setErr('신청 처리 중 오류가 발생했습니다.');
    }
    setLoading(false);
  }

  const left = Math.max(0, slot.capacity - slot.booked_count);

  return (
    <div className="px-4 pt-2 pb-6">
      <Link
        href={backHref}
        className="inline-flex items-center text-sm text-muted-foreground mb-3 gap-1"
      >
        ← 목록
      </Link>

      <Card className="p-4 mb-4">
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{typeLabel(slot.type)}</span>
        <h1 className="text-lg font-bold mt-2">
          {slot.mentors?.name ?? '멘토'} · {slot.subject ?? slot.mentors?.subject ?? '과목 미정'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {slot.date} {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
        </p>
        {slot.location && (
          <p className="text-sm text-muted-foreground">장소: {slot.location}</p>
        )}
        <p className="text-sm mt-2">남은 좌석: {left} / {slot.capacity}</p>
      </Card>

      {left <= 0 ? (
        <p className="text-sm text-destructive">정원이 마감되었습니다.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="note" className="text-sm font-medium">
              신청 메모 (선택)
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="멘토에게 전달할 내용이 있으면 입력하세요."
              maxLength={500}
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '처리 중…' : '신청하기'}
          </Button>
        </form>
      )}
    </div>
  );
}
