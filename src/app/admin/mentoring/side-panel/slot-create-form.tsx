'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Mentor, MentoringType } from '@/types/database';
import {
  createMentoringSlot,
  createMentoringSlotsBulk,
  deleteMentoringSlotsBulk,
  previewMentoringSlotsBulkDelete,
  type MentoringSlotAdminInput,
  type MentoringSlotsBulkDeleteTarget,
} from '@/lib/actions/mentoring';
import { getMondayOfWeekKST } from '@/lib/mentoring-calendar';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';

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

type Mode = 'single' | 'bulk' | 'bulk-delete';

export function SlotCreateForm({ mentors, defaultDate, defaultMentorId, onDirtyChange }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('single');
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

  // 반복(벌크) 삭제 — 등록과 같은 조건을 다시 입력해 대상을 특정한다.
  // (mentoring_slots 에 "벌크 묶음" 식별자가 없어 사후에 묶음을 찾을 수단이 없다.)
  const [delState, setDelState] = useState({
    mentor_id: initialMentorId,
    weekStartMonday: getMondayOfWeekKST(defaultDate),
    repeatWeeks: 4,
    weekdaySet: new Set<number>([3]),
    start_time: '15:00',
    /** 시각 무관 삭제 — 그 요일의 모든 슬롯이 대상 */
    anyTime: false,
    type: 'all' as MentoringType | 'all',
  });
  const [preview, setPreview] = useState<MentoringSlotsBulkDeleteTarget[] | null>(null);

  // 외부에서 defaultDate 가 바뀌면 (다른 빈 셀 클릭) 폼을 그 날짜로 갱신.
  // useEffect 대신 "렌더 중 비교 → setState" 패턴 사용 (React 공식 권고).
  const [prevDefaultDate, setPrevDefaultDate] = useState(defaultDate);
  if (prevDefaultDate !== defaultDate) {
    setPrevDefaultDate(defaultDate);
    setSingle((s) => ({ ...s, date: defaultDate }));
    setBulkState((s) => ({ ...s, weekStartMonday: getMondayOfWeekKST(defaultDate) }));
    setDelState((s) => ({ ...s, weekStartMonday: getMondayOfWeekKST(defaultDate) }));
    setPreview(null);
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
      setOkMsg(
        `${res.created}개 슬롯이 등록되었습니다.${
          res.skipped ? ` (${res.skipped}개는 기존 일정과 겹쳐 제외)` : ''
        }`,
      );
      router.refresh();
    });
  }

  function toggleDelWeekday(v: number) {
    setDelState((s) => {
      const next = new Set(s.weekdaySet);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...s, weekdaySet: next };
    });
    setPreview(null);
  }

  /** 반복 삭제 조건 → 서버 액션 입력. 미리보기와 실행이 같은 조건을 쓰도록 한 곳에서 만든다. */
  function buildDeleteInput() {
    return {
      mentor_id: delState.mentor_id,
      weekStartMonday: getMondayOfWeekKST(delState.weekStartMonday),
      repeatWeeks: delState.repeatWeeks,
      weekdays: [...delState.weekdaySet].sort((a, b) => a - b),
      start_time: delState.anyTime ? null : delState.start_time,
      type: delState.type,
    };
  }

  function runPreview() {
    setError(null);
    setOkMsg(null);
    if (delState.weekdaySet.size === 0) {
      setError('요일을 하나 이상 선택해 주세요.');
      return;
    }
    startTransition(async () => {
      const res = await previewMentoringSlotsBulkDelete(buildDeleteInput());
      if (res.error) {
        setError(res.error);
        setPreview(null);
        return;
      }
      setPreview(res.targets ?? []);
    });
  }

  function runBulkDelete() {
    if (!preview) return;
    const removable = countActionable(preview);
    if (removable === 0) return;
    if (
      !window.confirm(
        `조건에 맞는 일정 ${removable}건을 정리합니다.\n` +
          '신청 이력이 없는 일정은 삭제되고, 취소·거절 이력이 있는 일정은 이력 보존을 위해 숨김 처리됩니다.\n' +
          '진행할까요?',
      )
    ) {
      return;
    }
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const res = await deleteMentoringSlotsBulk(buildDeleteInput());
      if (res.error) {
        setError(res.error);
        return;
      }
      const parts = [`삭제 ${res.deleted}건`];
      if (res.hidden > 0) parts.push(`숨김 ${res.hidden}건`);
      if (res.blocked > 0) parts.push(`신청자 있어 제외 ${res.blocked}건`);
      setOkMsg(parts.join(' · '));
      setPreview(null);
      router.refresh();
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setOkMsg(null);
    setPreview(null);
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
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          onClick={() => switchMode('single')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            mode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          단일
        </button>
        <button
          type='button'
          onClick={() => switchMode('bulk')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            mode === 'bulk' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          반복(벌크)
        </button>
        <button
          type='button'
          onClick={() => switchMode('bulk-delete')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            mode === 'bulk-delete'
              ? 'bg-destructive text-white'
              : 'bg-muted text-destructive dark:text-red-400'
          }`}
        >
          반복 삭제
        </button>
      </div>

      {error && <p className='text-destructive text-sm'>{error}</p>}
      {okMsg && <p className='text-sm text-emerald-600 dark:text-emerald-400'>{okMsg}</p>}

      {mode === 'single' ? (
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
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
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
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
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
      ) : mode === 'bulk' ? (
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
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
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
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
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
      ) : (
        <div className='space-y-3'>
          <p className='text-muted-foreground bg-muted/60 rounded-xl p-3 text-xs leading-relaxed'>
            등록할 때와 같은 조건으로 일정을 찾아 한 번에 정리합니다. 삭제 전에 [대상 조회]로 목록을
            확인하세요. 대기·확정 신청이 있는 일정은 삭제되지 않습니다.
          </p>
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>멘토</span>
            <select
              className='border-input w-full rounded-xl border px-3 py-2'
              value={delState.mentor_id}
              onChange={(e) => {
                setDelState((s) => ({ ...s, mentor_id: e.target.value }));
                setPreview(null);
              }}
            >
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>
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
              value={delState.weekStartMonday}
              onChange={(e) => {
                setDelState((s) => ({ ...s, weekStartMonday: e.target.value }));
                setPreview(null);
              }}
            />
          </label>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>반복 주 수</span>
              <input
                type='number'
                min={1}
                max={52}
                className='border-input w-full rounded-xl border px-3 py-2'
                value={delState.repeatWeeks}
                onChange={(e) => {
                  setDelState((s) => ({ ...s, repeatWeeks: Number(e.target.value) || 1 }));
                  setPreview(null);
                }}
              />
            </label>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>유형</span>
              <select
                className='border-input w-full rounded-xl border px-3 py-2'
                value={delState.type}
                onChange={(e) => {
                  setDelState((s) => ({ ...s, type: e.target.value as MentoringType | 'all' }));
                  setPreview(null);
                }}
              >
                <option value='all'>전체</option>
                <option value='mentoring'>멘토링</option>
                <option value='clinic'>클리닉</option>
                <option value='consult'>상담</option>
              </select>
            </label>
          </div>
          <div className='space-y-2'>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>시작 시각</span>
              <input
                type='time'
                disabled={delState.anyTime}
                className='border-input w-full rounded-xl border px-3 py-2 disabled:opacity-50'
                value={delState.start_time}
                onChange={(e) => {
                  setDelState((s) => ({ ...s, start_time: e.target.value }));
                  setPreview(null);
                }}
              />
            </label>
            <label className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={delState.anyTime}
                onChange={(e) => {
                  setDelState((s) => ({ ...s, anyTime: e.target.checked }));
                  setPreview(null);
                }}
              />
              <span className='text-muted-foreground'>시각 무관 (그 요일의 모든 일정)</span>
            </label>
          </div>
          <div className='space-y-2'>
            <span className='text-muted-foreground text-sm'>요일 (복수 선택)</span>
            <div className='flex flex-wrap gap-2'>
              {weekdays.map((w) => (
                <button
                  key={w.v}
                  type='button'
                  onClick={() => toggleDelWeekday(w.v)}
                  className={`rounded-full px-3 py-1 text-sm ${
                    delState.weekdaySet.has(w.v)
                      ? 'bg-destructive text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type='button'
            disabled={pending}
            onClick={runPreview}
            className='border-input hover:bg-muted w-full rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50'
          >
            대상 조회
          </button>

          {preview && <BulkDeletePreview targets={preview} />}

          {preview && countActionable(preview) > 0 && (
            <button
              type='button'
              disabled={pending}
              onClick={runBulkDelete}
              className='bg-destructive w-full rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
            >
              {countActionable(preview)}건 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 실제로 변경이 일어나는 대상 수. blocked 는 물론이고 이미 숨김 상태인 슬롯도 제외한다
 * (서버가 이미 비활성인 행은 다시 update 하지 않으므로 버튼 숫자와 결과 숫자를 맞춘다).
 */
function countActionable(targets: MentoringSlotsBulkDeleteTarget[]): number {
  return targets.filter((t) => t.action === 'delete' || (t.action === 'hide' && t.is_active))
    .length;
}

/** 반복 삭제 대상 미리보기 — 처리구분(삭제/숨김/제외)별 요약 + 목록. */
function BulkDeletePreview({ targets }: { targets: MentoringSlotsBulkDeleteTarget[] }) {
  if (targets.length === 0) {
    return (
      <p className='text-muted-foreground rounded-xl border border-dashed p-3 text-sm'>
        조건에 맞는 일정이 없습니다. 요일·시각·기간을 확인해 주세요.
      </p>
    );
  }

  const toDelete = targets.filter((t) => t.action === 'delete').length;
  const toHide = targets.filter((t) => t.action === 'hide' && t.is_active).length;
  const alreadyHidden = targets.filter((t) => t.action === 'hide' && !t.is_active).length;
  const blocked = targets.filter((t) => t.action === 'blocked').length;

  const MAX_ROWS = 40;
  const shown = targets.slice(0, MAX_ROWS);

  return (
    <div className='space-y-2 rounded-xl border p-3'>
      <p className='text-sm font-medium'>
        대상 {targets.length}건 — 삭제 {toDelete}
        {toHide > 0 ? ` · 숨김 ${toHide}` : ''}
        {alreadyHidden > 0 ? ` · 이미 숨김 ${alreadyHidden}` : ''}
        {blocked > 0 ? ` · 제외 ${blocked}` : ''}
      </p>
      {blocked > 0 && (
        <p className='text-xs text-amber-600 dark:text-amber-400'>
          대기·확정 신청이 있는 {blocked}건은 삭제되지 않습니다. 신청을 먼저 처리해 주세요.
        </p>
      )}
      <ul className='max-h-56 space-y-1 overflow-y-auto text-xs'>
        {shown.map((t) => (
          <li key={t.id} className='flex items-center justify-between gap-2'>
            <span className='truncate'>
              {t.date.slice(5).replace('-', '/')} {String(t.start_time).slice(0, 5)}–
              {String(t.end_time).slice(0, 5)} · {MENTORING_TYPE_LABEL[t.type]}
              {t.subject ? ` · ${t.subject}` : ''}
            </span>
            <span
              className={
                t.action === 'blocked'
                  ? 'shrink-0 text-amber-600 dark:text-amber-400'
                  : t.action === 'hide'
                    ? 'text-muted-foreground shrink-0'
                    : 'text-destructive shrink-0'
              }
            >
              {t.action === 'blocked'
                ? `제외 (신청 ${t.activeApplications})`
                : t.action === 'hide'
                  ? t.is_active
                    ? '숨김'
                    : '이미 숨김'
                  : '삭제'}
            </span>
          </li>
        ))}
      </ul>
      {targets.length > MAX_ROWS && (
        <p className='text-muted-foreground text-xs'>외 {targets.length - MAX_ROWS}건</p>
      )}
    </div>
  );
}
