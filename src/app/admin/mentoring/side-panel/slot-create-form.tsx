'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Mentor, MentoringType } from '@/types/database';
import {
  createMentoringSlot,
  createMentoringSlotsBulk,
  type MentoringSlotAdminInput,
} from '@/lib/actions/mentoring';
import { getMondayOfWeekKST } from '@/lib/mentoring-calendar';

interface Props {
  mentors: Mentor[];
  defaultDate: string;
  defaultMentorId?: string | null;
  /** 폼 dirty 상태가 외부에 알려져야 모드 전환 시 confirm 모달을 띄울 수 있다. */
  onDirtyChange?: (dirty: boolean) => void;
}

const weekdays = [
  { v: 1, label: '월' },
  { v: 2, label: '화' },
  { v: 3, label: '수' },
  { v: 4, label: '목' },
  { v: 5, label: '금' },
  { v: 6, label: '토' },
  { v: 7, label: '일' },
];

export function SlotCreateForm({ mentors, defaultDate, defaultMentorId, onDirtyChange }: Props) {
  const router = useRouter();
  const [bulk, setBulk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const initialMentorId = defaultMentorId || mentors[0]?.id || '';

  const [single, setSingle] = useState<MentoringSlotAdminInput>({
    mentor_id: initialMentorId,
    date: defaultDate,
    start_time: '15:00',
    end_time: '16:00',
    type: 'mentoring',
    subject: '',
    capacity: 1,
    location: '',
    note: '',
  });

  const [bulkState, setBulkState] = useState({
    mentor_id: initialMentorId,
    weekStartMonday: getMondayOfWeekKST(defaultDate),
    repeatWeeks: 4,
    weekdaySet: new Set<number>([3]),
    start_time: '15:00',
    end_time: '16:00',
    type: 'mentoring' as MentoringType,
    subject: '',
    capacity: 1,
    location: '',
    note: '',
  });

  // 외부에서 defaultDate 가 바뀌면 (다른 빈 셀 클릭) 폼을 그 날짜로 갱신.
  // useEffect 대신 "렌더 중 비교 → setState" 패턴 사용 (React 공식 권고).
  const [prevDefaultDate, setPrevDefaultDate] = useState(defaultDate);
  if (prevDefaultDate !== defaultDate) {
    setPrevDefaultDate(defaultDate);
    setSingle((s) => ({ ...s, date: defaultDate }));
    setBulkState((s) => ({ ...s, weekStartMonday: getMondayOfWeekKST(defaultDate) }));
  }

  // dirty 추적: 입력 필드 중 어느 하나라도 기본값과 다르면 dirty 로 본다.
  const dirty =
    single.subject !== '' ||
    single.location !== '' ||
    single.note !== '' ||
    single.start_time !== '15:00' ||
    single.end_time !== '16:00' ||
    single.capacity !== 1 ||
    single.type !== 'mentoring' ||
    bulkState.subject !== '' ||
    bulkState.location !== '' ||
    bulkState.note !== '';
  // 부모에게 통보는 useEffect 없이 즉시 호출 (idempotent 한 setter 가정).
  // 단 부모의 setState 를 직접 호출하면 React 가 경고하지 않도록 prev 값 비교.
  const [prevDirty, setPrevDirty] = useState(false);
  if (onDirtyChange && prevDirty !== dirty) {
    setPrevDirty(dirty);
    onDirtyChange(dirty);
  }

  function toggleWeekday(v: number) {
    setBulkState((s) => {
      const next = new Set(s.weekdaySet);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...s, weekdaySet: next };
    });
  }

  function submitSingle() {
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const res = await createMentoringSlot(single);
      if (res.error) {
        setError(res.error);
        return;
      }
      setOkMsg('슬롯이 등록되었습니다.');
      if (res.data) {
        // 등록 직후 그 슬롯의 상세 모드로 전환
        const url = new URL(window.location.href);
        url.searchParams.delete('new');
        url.searchParams.delete('date');
        url.searchParams.set('slot', res.data.id);
        router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
      }
      router.refresh();
    });
  }

  function submitBulk() {
    setError(null);
    setOkMsg(null);
    const weekdaysArr = [...bulkState.weekdaySet].sort((a, b) => a - b);
    if (weekdaysArr.length === 0) {
      setError('요일을 하나 이상 선택해 주세요.');
      return;
    }
    startTransition(async () => {
      const res = await createMentoringSlotsBulk({
        mentor_id: bulkState.mentor_id,
        weekStartMonday: getMondayOfWeekKST(bulkState.weekStartMonday),
        repeatWeeks: bulkState.repeatWeeks,
        weekdays: weekdaysArr,
        start_time: bulkState.start_time,
        end_time: bulkState.end_time,
        type: bulkState.type,
        subject: bulkState.subject || null,
        capacity: bulkState.capacity,
        location: bulkState.location || null,
        note: bulkState.note || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOkMsg(`${res.created}개 슬롯이 등록되었습니다.`);
      router.refresh();
    });
  }

  if (mentors.length === 0) {
    return (
      <div className='space-y-3 p-1'>
        <p className='text-muted-foreground text-sm'>
          등록된 멘토가 없습니다. 먼저 멘토를 등록해 주세요.
        </p>
        <a
          href='/admin/mentoring/mentors'
          className='text-primary inline-block text-sm font-medium'
        >
          멘토 관리로 이동
        </a>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex gap-2'>
        <button
          type='button'
          onClick={() => setBulk(false)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            !bulk ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          단일
        </button>
        <button
          type='button'
          onClick={() => setBulk(true)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            bulk ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          반복(벌크)
        </button>
      </div>

      {error && <p className='text-destructive text-sm'>{error}</p>}
      {okMsg && <p className='text-sm text-emerald-600 dark:text-emerald-400'>{okMsg}</p>}

      {!bulk ? (
        <div className='space-y-3'>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>멘토</span>
            <select
              className='border-input w-full rounded-xl border px-3 py-2'
              value={single.mentor_id}
              onChange={(e) => setSingle((s) => ({ ...s, mentor_id: e.target.value }))}
            >
              {mentors.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.is_active}>
                  {m.name} {!m.is_active ? '(비활성)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>날짜</span>
            <input
              type='date'
              className='border-input w-full rounded-xl border px-3 py-2'
              value={single.date}
              onChange={(e) => setSingle((s) => ({ ...s, date: e.target.value }))}
            />
          </label>
          <div className='grid grid-cols-2 gap-3'>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>시작</span>
              <input
                type='time'
                className='border-input w-full rounded-xl border px-3 py-2'
                value={String(single.start_time).slice(0, 5)}
                onChange={(e) => setSingle((s) => ({ ...s, start_time: e.target.value }))}
              />
            </label>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>종료</span>
              <input
                type='time'
                className='border-input w-full rounded-xl border px-3 py-2'
                value={String(single.end_time).slice(0, 5)}
                onChange={(e) => setSingle((s) => ({ ...s, end_time: e.target.value }))}
              />
            </label>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>유형</span>
              <select
                className='border-input w-full rounded-xl border px-3 py-2'
                value={single.type}
                onChange={(e) =>
                  setSingle((s) => ({ ...s, type: e.target.value as MentoringType }))
                }
              >
                <option value='mentoring'>멘토링</option>
                <option value='clinic'>클리닉</option>
                <option value='consult'>상담</option>
              </select>
            </label>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>정원</span>
              <input
                type='number'
                min={1}
                className='border-input w-full rounded-xl border px-3 py-2'
                value={single.capacity}
                onChange={(e) =>
                  setSingle((s) => ({ ...s, capacity: Number(e.target.value) || 1 }))
                }
              />
            </label>
          </div>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>과목·주제</span>
            <input
              className='border-input w-full rounded-xl border px-3 py-2'
              value={single.subject ?? ''}
              onChange={(e) => setSingle((s) => ({ ...s, subject: e.target.value }))}
            />
          </label>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>장소</span>
            <input
              className='border-input w-full rounded-xl border px-3 py-2'
              value={single.location ?? ''}
              onChange={(e) => setSingle((s) => ({ ...s, location: e.target.value }))}
            />
          </label>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>비고</span>
            <textarea
              className='border-input min-h-[60px] w-full rounded-xl border px-3 py-2'
              value={single.note ?? ''}
              onChange={(e) => setSingle((s) => ({ ...s, note: e.target.value }))}
            />
          </label>
          <button
            type='button'
            disabled={pending}
            onClick={submitSingle}
            className='bg-primary text-primary-foreground w-full rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50'
          >
            등록
          </button>
        </div>
      ) : (
        <div className='space-y-3'>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>멘토</span>
            <select
              className='border-input w-full rounded-xl border px-3 py-2'
              value={bulkState.mentor_id}
              onChange={(e) => setBulkState((s) => ({ ...s, mentor_id: e.target.value }))}
            >
              {mentors.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.is_active}>
                  {m.name} {!m.is_active ? '(비활성)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>기준 날짜 (해당 주 월요일로 자동 맞춤)</span>
            <input
              type='date'
              className='border-input w-full rounded-xl border px-3 py-2'
              value={bulkState.weekStartMonday}
              onChange={(e) => setBulkState((s) => ({ ...s, weekStartMonday: e.target.value }))}
            />
          </label>
          <div className='grid grid-cols-2 gap-3'>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>반복 주 수</span>
              <input
                type='number'
                min={1}
                max={52}
                className='border-input w-full rounded-xl border px-3 py-2'
                value={bulkState.repeatWeeks}
                onChange={(e) =>
                  setBulkState((s) => ({ ...s, repeatWeeks: Number(e.target.value) || 1 }))
                }
              />
            </label>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>유형</span>
              <select
                className='border-input w-full rounded-xl border px-3 py-2'
                value={bulkState.type}
                onChange={(e) =>
                  setBulkState((s) => ({ ...s, type: e.target.value as MentoringType }))
                }
              >
                <option value='mentoring'>멘토링</option>
                <option value='clinic'>클리닉</option>
                <option value='consult'>상담</option>
              </select>
            </label>
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>시작</span>
              <input
                type='time'
                className='border-input w-full rounded-xl border px-3 py-2'
                value={bulkState.start_time}
                onChange={(e) => setBulkState((s) => ({ ...s, start_time: e.target.value }))}
              />
            </label>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>종료</span>
              <input
                type='time'
                className='border-input w-full rounded-xl border px-3 py-2'
                value={bulkState.end_time}
                onChange={(e) => setBulkState((s) => ({ ...s, end_time: e.target.value }))}
              />
            </label>
          </div>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>정원</span>
            <input
              type='number'
              min={1}
              className='border-input w-full rounded-xl border px-3 py-2'
              value={bulkState.capacity}
              onChange={(e) =>
                setBulkState((s) => ({ ...s, capacity: Number(e.target.value) || 1 }))
              }
            />
          </label>
          <div className='space-y-2'>
            <span className='text-muted-foreground text-sm'>요일 (복수 선택)</span>
            <div className='flex flex-wrap gap-2'>
              {weekdays.map((w) => (
                <button
                  key={w.v}
                  type='button'
                  onClick={() => toggleWeekday(w.v)}
                  className={`rounded-full px-3 py-1 text-sm ${
                    bulkState.weekdaySet.has(w.v)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>과목·주제</span>
            <input
              className='border-input w-full rounded-xl border px-3 py-2'
              value={bulkState.subject}
              onChange={(e) => setBulkState((s) => ({ ...s, subject: e.target.value }))}
            />
          </label>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>장소</span>
            <input
              className='border-input w-full rounded-xl border px-3 py-2'
              value={bulkState.location}
              onChange={(e) => setBulkState((s) => ({ ...s, location: e.target.value }))}
            />
          </label>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>비고</span>
            <textarea
              className='border-input min-h-[60px] w-full rounded-xl border px-3 py-2'
              value={bulkState.note}
              onChange={(e) => setBulkState((s) => ({ ...s, note: e.target.value }))}
            />
          </label>
          <button
            type='button'
            disabled={pending}
            onClick={submitBulk}
            className='bg-primary text-primary-foreground w-full rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50'
          >
            벌크 등록
          </button>
        </div>
      )}
    </div>
  );
}
