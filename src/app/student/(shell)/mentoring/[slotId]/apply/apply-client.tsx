'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  applyMentoring,
  uploadMentoringApplicationAttachment,
  removeMentoringApplicationAttachment,
  type MentoringSlotWithMentor,
} from '@/lib/actions/mentoring';
import type { MentoringAttachment } from '@/types/database';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import { cn } from '@/lib/utils';

const MAX_ATTACHMENTS = 3;
const CONTENT_MIN = 5;
const CONTENT_MAX = 2000;

function buildSubtitle(slot: MentoringSlotWithMentor): string {
  const m = slot.mentors;
  if (!m) return '';
  if (slot.type === 'clinic') {
    const list = (m.subjects ?? []).filter(Boolean);
    if (list.length > 0) return `(${list.join(', ')})`;
    if (m.subject) return `(${m.subject})`;
    return '과목 미정';
  }
  return m.headline ?? '';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [attachments, setAttachments] = useState<MentoringAttachment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, startSubmit] = useTransition();

  const left = Math.max(0, slot.capacity - slot.booked_count);
  const subjects = (slot.mentors?.subjects ?? []).filter(Boolean);
  const subtitle = buildSubtitle(slot);
  const isClinic = slot.type === 'clinic';
  const blockedClinic = isClinic && subjects.length === 0;

  async function handlePickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadErr(null);
    const remain = MAX_ATTACHMENTS - attachments.length;
    if (remain <= 0) {
      setUploadErr(`사진은 최대 ${MAX_ATTACHMENTS}장까지 첨부할 수 있습니다.`);
      return;
    }
    const targets = Array.from(files).slice(0, remain);
    setUploading(true);
    const accumulated: MentoringAttachment[] = [];
    for (const file of targets) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadMentoringApplicationAttachment(fd);
      if (res.error || !res.data) {
        setUploadErr(res.error ?? '업로드에 실패했습니다.');
        break;
      }
      accumulated.push(res.data);
    }
    if (accumulated.length > 0) {
      setAttachments((prev) => [...prev, ...accumulated]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleRemoveAttachment(idx: number) {
    const target = attachments[idx];
    if (!target) return;
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    // best-effort: 스토리지 삭제 실패해도 UI는 진행
    void removeMentoringApplicationAttachment(target.url).catch(() => {
      /* ignore */
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmed = content.trim();
    if (trimmed.length < CONTENT_MIN) {
      setErr(`문의 내용을 ${CONTENT_MIN}자 이상 입력해 주세요.`);
      return;
    }
    if (isClinic && !selectedSubject) {
      setErr('클리닉 과목을 선택해 주세요.');
      return;
    }
    startSubmit(async () => {
      const res = await applyMentoring(slot.id, studentId, {
        content: trimmed,
        selectedSubject: isClinic ? selectedSubject : null,
        attachments,
      });
      if (res.error) {
        setErr(res.error);
        return;
      }
      router.push(backHref.includes('/parent/') ? '/parent/mentoring/my' : '/student/mentoring/my');
    });
  }

  return (
    <div className='px-4 pt-2 pb-6'>
      <Link
        href={backHref}
        className='text-muted-foreground mb-3 inline-flex items-center gap-1 text-sm'
      >
        ← 목록
      </Link>

      <Card className='mb-4 p-4'>
        <div className='flex items-start gap-3'>
          <div className='bg-muted size-12 shrink-0 overflow-hidden rounded-full'>
            {slot.mentors?.profile_image_url ? (
              <Image
                src={slot.mentors.profile_image_url}
                alt={slot.mentors.name}
                width={48}
                height={48}
                unoptimized
                className='size-full object-cover'
              />
            ) : null}
          </div>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-1.5'>
              <span className='bg-muted rounded-full px-2 py-0.5 text-xs'>
                [{MENTORING_TYPE_LABEL[slot.type]}]
              </span>
            </div>
            <p className='mt-1 font-semibold'>
              {slot.mentors?.name ?? '멘토'}
              {subtitle && <span className='text-foreground/80 ml-1 font-normal'>{subtitle}</span>}
            </p>
            <p className='text-muted-foreground mt-1 text-sm'>예약일 {slot.date}</p>
            <p className='text-muted-foreground text-sm'>
              예약시간 {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
            </p>
            {slot.location && (
              <p className='text-muted-foreground text-sm'>장소: {slot.location}</p>
            )}
            <p className='mt-2 text-sm'>
              남은 좌석: {left} / {slot.capacity}
            </p>
          </div>
        </div>
      </Card>

      {left <= 0 ? (
        <p className='text-destructive text-sm'>정원이 마감되었습니다.</p>
      ) : (
        <form onSubmit={onSubmit} className='space-y-5'>
          {isClinic && (
            <div>
              <label htmlFor='clinic-subject' className='text-sm font-medium'>
                클리닉 과목 선택 <span className='text-destructive'>*</span>
              </label>
              {subjects.length === 0 ? (
                <p className='text-destructive mt-1 text-xs'>
                  멘토에 등록된 과목이 없습니다. 관리자에게 문의해 주세요.
                </p>
              ) : (
                <select
                  id='clinic-subject'
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className='border-input bg-background mt-1 w-full rounded-xl border px-3 py-2 text-sm'
                  required
                >
                  <option value=''>선택</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label htmlFor='content' className='text-sm font-medium'>
              문의 내용 <span className='text-destructive'>*</span>
            </label>
            <textarea
              id='content'
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className='border-input bg-background mt-1 min-h-[160px] w-full rounded-xl border px-3 py-2 text-sm'
              placeholder={
                isClinic
                  ? '문제·풀이 과정·헷갈리는 개념 등을 자세히 적어주세요.'
                  : slot.type === 'consult'
                    ? '상담 받고 싶은 내용을 자세히 적어주세요.'
                    : '멘토에게 전달할 내용을 자세히 적어주세요.'
              }
              maxLength={CONTENT_MAX}
              required
            />
            <p className='text-muted-foreground mt-1 text-xs'>
              {content.length}/{CONTENT_MAX} (최소 {CONTENT_MIN}자)
            </p>
          </div>

          <div>
            <span className='text-sm font-medium'>사진 첨부</span>
            <input
              ref={fileInputRef}
              type='file'
              accept='image/jpeg,image/png,image/webp,image/gif'
              multiple
              className='hidden'
              onChange={(e) => handlePickFiles(e.target.files)}
            />
            <div className='mt-2 flex flex-wrap gap-2'>
              {attachments.map((att, idx) => (
                <div key={att.url} className='relative size-20 overflow-hidden rounded-lg border'>
                  <Image
                    src={att.url}
                    alt={att.name}
                    width={80}
                    height={80}
                    unoptimized
                    className='size-full object-cover'
                  />
                  <button
                    type='button'
                    onClick={() => handleRemoveAttachment(idx)}
                    className='absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white'
                    aria-label='첨부 삭제'
                  >
                    <X className='size-3.5' />
                  </button>
                </div>
              ))}
              {attachments.length < MAX_ATTACHMENTS && (
                <button
                  type='button'
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'text-muted-foreground flex size-20 flex-col items-center justify-center rounded-lg border border-dashed text-xs transition-colors',
                    'hover:bg-muted/50 disabled:opacity-50',
                  )}
                >
                  <Camera className='size-5' />
                  <span className='mt-0.5'>
                    {uploading ? '업로드 중…' : `(${attachments.length}/${MAX_ATTACHMENTS})`}
                  </span>
                </button>
              )}
            </div>
            {uploadErr && <p className='text-destructive mt-1 text-xs'>{uploadErr}</p>}
          </div>

          <p className='text-muted-foreground text-xs'>
            예약일 시작 전까지만 신청·취소가 가능합니다.
          </p>

          {err && <p className='text-destructive text-sm'>{err}</p>}
          <Button
            type='submit'
            className='w-full'
            disabled={submitting || uploading || blockedClinic}
          >
            {submitting ? '처리 중…' : '신청하기'}
          </Button>
        </form>
      )}
    </div>
  );
}
