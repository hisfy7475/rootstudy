'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Paperclip, Pencil, Trash2, UserPlus } from 'lucide-react';
import type { Mentor, MentoringSlot, MentoringType } from '@/types/database';
import {
  adminApplyMentoring,
  adminCancelMentoringApplication,
  confirmMentoringApplication,
  deleteMentoringSlot,
  rejectMentoringApplication,
  updateMentoringSlot,
  type AdminMentoringApplicationRow,
  type MentoringSlotAdminInput,
} from '@/lib/actions/mentoring';
import { MENTORING_TYPE_LABEL, isMentoringActiveStatus } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { handleNativeAttachmentClick } from '@/lib/native-bridge';
import { StudentCombobox, type StudentOption } from './student-combobox';

interface Props {
  slot: MentoringSlot & { mentors: Mentor | null };
  initialApplications: AdminMentoringApplicationRow[];
  mentors: Mentor[];
  /** 최고관리자면 신청 추가 학생 검색을 전 지점으로 확장(교차 지점 대리 등록). */
  isSuperAdmin?: boolean;
}

const statusLabel: Record<string, string> = {
  pending: '대기',
  confirmed: '확정',
  rejected: '거절',
  cancelled: '취소',
};

function fmtTime(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function SlotDetailPanel({
  slot,
  initialApplications,
  mentors,
  isSuperAdmin = false,
}: Props) {
  const router = useRouter();
  // server fetch(via router.refresh) 결과를 권위로 삼고, 로컬 낙관적 갱신은 그 위에 덮어쓰는 패턴.
  const [applications, setApplications] = useState(initialApplications);
  const [prevInitial, setPrevInitial] = useState(initialApplications);
  // 신청자 행별 액션(확정/거절/취소) 에러. 패널 최상단이 아니라 해당 버튼 옆에 노출.
  const [rowError, setRowError] = useState<Record<string, string>>({});
  if (prevInitial !== initialApplications) {
    setPrevInitial(initialApplications);
    setApplications(initialApplications);
    // 새 서버 데이터로 동기화될 때 행별 에러도 함께 비운다(데이터만 리셋되고 에러가 남는 엣지 방지).
    setRowError({});
  }
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});

  // 신청 추가
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [applyContent, setApplyContent] = useState('');
  const [applySubject, setApplySubject] = useState('');

  // 슬롯 수정 폼
  const [form, setForm] = useState<Partial<MentoringSlotAdminInput>>({
    mentor_id: slot.mentor_id,
    date: slot.date,
    start_time: fmtTime(String(slot.start_time)),
    end_time: fmtTime(String(slot.end_time)),
    type: slot.type,
    subject: slot.subject ?? '',
    capacity: slot.capacity,
    location: slot.location ?? '',
    note: slot.note ?? '',
    is_active: slot.is_active,
  });

  const mentorSubjects = slot.mentors?.subjects ?? [];

  // 활성(대기/확정) 신청과 취소·거절 이력을 분리. "신청자(N)"는 활성만 집계.
  const activeApps = applications.filter((a) => isMentoringActiveStatus(a.status));
  const inactiveApps = applications.filter((a) => !isMentoringActiveStatus(a.status));

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
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function removeSlot() {
    if (
      !confirm(
        '대기/확정 중인 신청이 없으면 삭제됩니다.\n취소·거절 이력만 있는 슬롯은 이력 보존을 위해 숨김(비활성) 처리됩니다.\n진행할까요?',
      )
    )
      return;
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const res = await deleteMentoringSlot(slot.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.softDeleted) {
        // 하드 삭제가 아니라 숨김 처리 — 패널을 닫지 않고 비활성 상태를 새로고침으로 반영.
        setOkMsg('취소·거절 이력이 있어 슬롯을 숨김(비활성) 처리했습니다.');
        router.refresh();
        return;
      }
      // 하드 삭제 후 사이드 패널 닫기
      const url = new URL(window.location.href);
      url.searchParams.delete('slot');
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
      router.refresh();
    });
  }

  function doAdminApply() {
    setError(null);
    setOkMsg(null);
    if (!selectedStudent) {
      setError('학생을 선택해 주세요.');
      return;
    }
    if (slot.type === 'clinic' && !applySubject) {
      setError('클리닉 과목을 선택해 주세요.');
      return;
    }
    startTransition(async () => {
      const res = await adminApplyMentoring(slot.id, selectedStudent.id, {
        content: applyContent || null,
        selectedSubject: slot.type === 'clinic' ? applySubject : null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOkMsg(`${selectedStudent.name}님 신청이 등록되었습니다.`);
      setSelectedStudent(null);
      setApplyContent('');
      setApplySubject('');
      router.refresh();
    });
  }

  function clearRowError(appId: string) {
    setRowError((r) => {
      if (!(appId in r)) return r;
      const next = { ...r };
      delete next[appId];
      return next;
    });
  }

  function confirmApp(appId: string) {
    setError(null);
    clearRowError(appId);
    startTransition(async () => {
      const res = await confirmMentoringApplication(appId);
      if (res.error) setRowError((r) => ({ ...r, [appId]: res.error! }));
      else {
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'confirmed' as const } : a)),
        );
        router.refresh();
      }
    });
  }

  function rejectApp(appId: string) {
    const reason = (rejectReason[appId] ?? '').trim();
    if (!reason) {
      setRowError((r) => ({ ...r, [appId]: '거절 사유를 입력해 주세요.' }));
      return;
    }
    setError(null);
    clearRowError(appId);
    startTransition(async () => {
      const res = await rejectMentoringApplication(appId, reason);
      if (res.error) setRowError((r) => ({ ...r, [appId]: res.error! }));
      else {
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'rejected' as const } : a)),
        );
        router.refresh();
      }
    });
  }

  function cancelApp(appId: string) {
    const reason = (cancelReason[appId] ?? '').trim();
    if (!reason) {
      setRowError((r) => ({ ...r, [appId]: '취소 사유를 입력해 주세요.' }));
      return;
    }
    setError(null);
    clearRowError(appId);
    startTransition(async () => {
      const res = await adminCancelMentoringApplication(appId, reason);
      if (res.error) setRowError((r) => ({ ...r, [appId]: res.error! }));
      else {
        setApplications((prev) =>
          prev.map((a) => (a.id === appId ? { ...a, status: 'cancelled' as const } : a)),
        );
        router.refresh();
      }
    });
  }

  const renderApp = (a: AdminMentoringApplicationRow) => (
    <li key={a.id} className='rounded-xl border p-3 text-sm'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='min-w-0'>
          <span className='font-medium'>{a.student_name}</span>
          {a.student_branch_name && (
            <span className='text-muted-foreground ml-1.5 text-xs'>{a.student_branch_name}</span>
          )}
          {a.applicant_name && a.applicant_name !== a.student_name && (
            <span className='text-muted-foreground'> — 신청자: {a.applicant_name}</span>
          )}
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs',
            a.status === 'pending' &&
              'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
            a.status === 'confirmed' && 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950',
            a.status === 'rejected' && 'bg-red-100 text-red-900 dark:bg-red-950',
            a.status === 'cancelled' && 'bg-muted',
          )}
        >
          {statusLabel[a.status] ?? a.status}
        </span>
      </div>
      {a.selected_subject && (
        <p className='text-muted-foreground mt-1 text-xs'>
          선택 과목: <span className='text-foreground font-medium'>{a.selected_subject}</span>
        </p>
      )}
      {a.content && (
        <p className='text-foreground/90 mt-2 text-sm whitespace-pre-wrap'>{a.content}</p>
      )}
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
                className='bg-muted hover:bg-muted/70 inline-flex max-w-full items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs'
              >
                <Paperclip className='size-3.5 flex-shrink-0' />
                <span className='max-w-[160px] truncate'>{att.name}</span>
              </a>
            ),
          )}
        </div>
      )}
      {a.reject_reason && (
        <p className='text-muted-foreground mt-1 text-xs'>거절 사유: {a.reject_reason}</p>
      )}
      {a.cancel_reason && (
        <p className='text-muted-foreground mt-1 text-xs'>취소 사유: {a.cancel_reason}</p>
      )}
      {a.status === 'pending' && (
        <div className='mt-3 space-y-2'>
          <button
            type='button'
            disabled={pending}
            onClick={() => confirmApp(a.id)}
            className='bg-primary text-primary-foreground w-full rounded-lg px-3 py-1.5 text-xs'
          >
            확정
          </button>
          <div className='flex items-center gap-2'>
            <input
              placeholder='거절 사유'
              className='border-input min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs'
              value={rejectReason[a.id] ?? ''}
              onChange={(e) => setRejectReason((r) => ({ ...r, [a.id]: e.target.value }))}
            />
            <button
              type='button'
              disabled={pending}
              onClick={() => rejectApp(a.id)}
              className='rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 dark:border-red-800 dark:text-red-300'
            >
              거절
            </button>
          </div>
        </div>
      )}
      {(a.status === 'pending' || a.status === 'confirmed') && (
        <div className='mt-2 flex items-center gap-2'>
          <input
            placeholder='관리자 취소 사유'
            className='border-input min-w-0 flex-1 rounded-lg border px-2 py-1 text-xs'
            value={cancelReason[a.id] ?? ''}
            onChange={(e) => setCancelReason((r) => ({ ...r, [a.id]: e.target.value }))}
          />
          <button
            type='button'
            disabled={pending}
            onClick={() => cancelApp(a.id)}
            className='bg-muted rounded-lg px-3 py-1.5 text-xs'
          >
            강제 취소
          </button>
        </div>
      )}
      {rowError[a.id] && <p className='text-destructive mt-2 text-xs'>{rowError[a.id]}</p>}
    </li>
  );

  return (
    <div className='space-y-5'>
      {error && <p className='text-destructive text-sm'>{error}</p>}
      {okMsg && <p className='text-sm text-emerald-600 dark:text-emerald-400'>{okMsg}</p>}

      {/* 슬롯 메타 / 수정 / 삭제 */}
      <div className='space-y-3'>
        <div className='flex items-center justify-between gap-2'>
          <h2 className='text-sm font-semibold'>슬롯 정보</h2>
          <div className='flex items-center gap-1'>
            <button
              type='button'
              onClick={() => setEditing((e) => !e)}
              className='hover:bg-muted rounded-md p-1.5'
              title={editing ? '편집 취소' : '수정'}
              disabled={pending}
            >
              <Pencil className='size-4' />
            </button>
            <button
              type='button'
              onClick={removeSlot}
              className='hover:bg-destructive/10 text-destructive rounded-md p-1.5'
              title='삭제'
              disabled={pending}
            >
              <Trash2 className='size-4' />
            </button>
          </div>
        </div>

        {!editing ? (
          <dl className='space-y-1.5 text-sm'>
            <Row label='멘토'>
              {slot.mentors?.name ?? '—'}
              {slot.mentors && !slot.mentors.is_active && (
                <span className='text-muted-foreground ml-1 text-xs'>(비활성)</span>
              )}
            </Row>
            <Row label='유형'>{MENTORING_TYPE_LABEL[slot.type as MentoringType]}</Row>
            <Row label='일시'>
              {slot.date} {fmtTime(String(slot.start_time))}–{fmtTime(String(slot.end_time))}
            </Row>
            <Row label='정원'>
              {slot.booked_count}/{slot.capacity}
              {!slot.is_active && (
                <span className='text-muted-foreground ml-1 text-xs'>(비활성 슬롯)</span>
              )}
            </Row>
            {slot.subject && <Row label='과목'>{slot.subject}</Row>}
            {slot.location && <Row label='장소'>{slot.location}</Row>}
            {slot.note && <Row label='비고'>{slot.note}</Row>}
          </dl>
        ) : (
          <div className='space-y-3'>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>멘토</span>
              <select
                className='border-input w-full rounded-xl border px-3 py-2'
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
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>날짜</span>
              <input
                type='date'
                className='border-input w-full rounded-xl border px-3 py-2'
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <div className='grid grid-cols-2 gap-3'>
              <label className='block space-y-1 text-sm'>
                <span className='text-muted-foreground'>시작</span>
                <input
                  type='time'
                  className='border-input w-full rounded-xl border px-3 py-2'
                  value={String(form.start_time).slice(0, 5)}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                />
              </label>
              <label className='block space-y-1 text-sm'>
                <span className='text-muted-foreground'>종료</span>
                <input
                  type='time'
                  className='border-input w-full rounded-xl border px-3 py-2'
                  value={String(form.end_time).slice(0, 5)}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                />
              </label>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <label className='block space-y-1 text-sm'>
                <span className='text-muted-foreground'>유형</span>
                <select
                  className='border-input w-full rounded-xl border px-3 py-2'
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as MentoringType }))
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
                  value={form.capacity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, capacity: Number(e.target.value) || 1 }))
                  }
                />
              </label>
            </div>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>과목</span>
              <input
                className='border-input w-full rounded-xl border px-3 py-2'
                value={form.subject ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </label>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>장소</span>
              <input
                className='border-input w-full rounded-xl border px-3 py-2'
                value={form.location ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </label>
            <label className='block space-y-1 text-sm'>
              <span className='text-muted-foreground'>비고</span>
              <textarea
                className='border-input min-h-[60px] w-full rounded-xl border px-3 py-2'
                value={form.note ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
            <label className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={form.is_active ?? true}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              활성
            </label>
            <div className='flex gap-2'>
              <button
                type='button'
                disabled={pending}
                onClick={saveSlot}
                className='bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50'
              >
                저장
              </button>
              <button
                type='button'
                onClick={() => setEditing(false)}
                disabled={pending}
                className='bg-muted flex-1 rounded-xl px-4 py-2 text-sm font-medium'
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      <hr className='border-border' />

      {/* 신청 추가 (어드민이 학생 대신) */}
      <div className='space-y-3'>
        <h2 className='flex items-center gap-1.5 text-sm font-semibold'>
          <UserPlus className='size-4' />
          신청 추가
        </h2>
        {/* 최고관리자는 전 지점 학생 검색(교차 지점 대리 등록). 일반 어드민은 슬롯 지점으로 한정. */}
        <StudentCombobox
          branchId={isSuperAdmin ? null : slot.branch_id}
          value={selectedStudent}
          onChange={setSelectedStudent}
          disabled={pending}
        />
        {slot.type === 'clinic' && (
          <label className='block space-y-1 text-sm'>
            <span className='text-muted-foreground'>클리닉 과목</span>
            <select
              className='border-input w-full rounded-xl border px-3 py-2'
              value={applySubject}
              onChange={(e) => setApplySubject(e.target.value)}
            >
              <option value=''>선택하세요</option>
              {mentorSubjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className='block space-y-1 text-sm'>
          <span className='text-muted-foreground'>메모 (선택)</span>
          <textarea
            className='border-input min-h-[50px] w-full rounded-xl border px-3 py-2'
            placeholder='비워두면 [관리자가 대신 등록]으로 기록됩니다.'
            value={applyContent}
            onChange={(e) => setApplyContent(e.target.value)}
          />
        </label>
        <button
          type='button'
          disabled={pending || !selectedStudent}
          onClick={doAdminApply}
          className='bg-primary text-primary-foreground w-full rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50'
        >
          신청 등록
        </button>
      </div>

      <hr className='border-border' />

      {/* 신청자 리스트 (활성만) */}
      <div className='space-y-3'>
        <h2 className='text-sm font-semibold'>신청자 ({activeApps.length})</h2>
        {activeApps.length === 0 ? (
          <p className='text-muted-foreground text-sm'>신청이 없습니다.</p>
        ) : (
          <ul className='space-y-3'>{activeApps.map(renderApp)}</ul>
        )}
      </div>

      {/* 취소·거절 내역 (이력, 흐리게) */}
      {inactiveApps.length > 0 && (
        <div className='space-y-3'>
          <h2 className='text-muted-foreground text-sm font-semibold'>
            취소·거절 내역 ({inactiveApps.length})
          </h2>
          <ul className='space-y-3 opacity-60'>{inactiveApps.map(renderApp)}</ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex items-start gap-2'>
      <dt className='text-muted-foreground w-14 flex-shrink-0 text-xs'>{label}</dt>
      <dd className='min-w-0 flex-1 text-sm'>{children}</dd>
    </div>
  );
}
