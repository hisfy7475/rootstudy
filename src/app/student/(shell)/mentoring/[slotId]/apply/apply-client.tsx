'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImagePlus, Paperclip, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  applyMentoring,
  uploadMentoringApplicationAttachment,
  uploadMentoringApplicationFile,
  removeMentoringApplicationAttachment,
  type MentoringSlotWithMentor,
} from '@/lib/actions/mentoring';
import type { MentoringAttachment } from '@/types/database';
import { MENTORING_TYPE_LABEL } from '@/lib/constants';
import { cn, isNativeApp, isNativeAppAtLeast } from '@/lib/utils';
import { postToNative } from '@/lib/native-bridge';
import {
  ATTACHMENT_FILE_ACCEPT,
  ATTACHMENT_FILE_MAX_BYTES,
  resolveAttachmentFileMime,
} from '@shared/uploads/attachments';

const MAX_ATTACHMENTS = 3;
const CONTENT_MIN = 5;
const CONTENT_MAX = 2000;
// 멘토링 첨부 네이티브 브리지가 지원되는 최소 앱 버전. 그 미만 앱은 첨부 영역을 비활성화하고 안내.
const NATIVE_ATTACH_MIN_MAJOR = 1;
const NATIVE_ATTACH_MIN_MINOR = 1;

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
  const imageInputRef = useRef<HTMLInputElement>(null);
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

  // 네이티브 환경 감지 + 멘토링 첨부 브리지 지원 버전 가드.
  // useSyncExternalStore 로 SSR/hydration mismatch 없이 클라이언트 한정으로 평가.
  const isNative = useSyncExternalStore(
    () => () => {},
    () => isNativeApp(),
    () => false,
  );
  const nativeVersionOk = useSyncExternalStore(
    () => () => {},
    () => !isNativeApp() || isNativeAppAtLeast(NATIVE_ATTACH_MIN_MAJOR, NATIVE_ATTACH_MIN_MINOR),
    () => true,
  );
  const attachmentsBlocked = isNative && !nativeVersionOk;

  // 네이티브 → 웹 FILE_UPLOADED / FILE_UPLOAD_ERROR 수신.
  // mentoring 컨텍스트만 처리해 채팅과의 cross-talk를 방지.
  useEffect(() => {
    if (typeof window === 'undefined' || !isNative) return;
    const handler = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : null;
      if (!raw) return;
      let parsed: {
        type?: string;
        payload?: {
          url?: string;
          filename?: string;
          mime_type?: string;
          message?: string;
          context?: string;
          size?: number;
        };
      } | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (!parsed || parsed.payload?.context !== 'mentoring') return;
      if (parsed.type === 'FILE_UPLOAD_ERROR') {
        setUploading(false);
        setUploadErr(parsed.payload?.message ?? '업로드에 실패했습니다.');
        return;
      }
      if (parsed.type !== 'FILE_UPLOADED' || !parsed.payload?.url) return;

      const url = parsed.payload.url;
      const mime = parsed.payload.mime_type ?? '';
      const name =
        parsed.payload.filename?.trim() || (mime.startsWith('image/') ? 'image' : 'file');
      setAttachments((prev) => {
        if (prev.length >= MAX_ATTACHMENTS) {
          setUploadErr(`첨부는 최대 ${MAX_ATTACHMENTS}개까지 추가할 수 있습니다.`);
          return prev;
        }
        return [...prev, { url, name, mime_type: mime || 'application/octet-stream', size: 0 }];
      });
      setUploading(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isNative]);

  const remain = MAX_ATTACHMENTS - attachments.length;
  const canAddMore = remain > 0 && !uploading && !attachmentsBlocked;

  async function handlePickImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadErr(null);
    if (remain <= 0) {
      setUploadErr(`첨부는 최대 ${MAX_ATTACHMENTS}개까지 추가할 수 있습니다.`);
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
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  async function handlePickDataFile(file: File | null) {
    if (!file) return;
    setUploadErr(null);
    if (remain <= 0) {
      setUploadErr(`첨부는 최대 ${MAX_ATTACHMENTS}개까지 추가할 수 있습니다.`);
      return;
    }
    if (file.type.startsWith('image/')) {
      setUploadErr('이미지는 이미지 첨부 버튼을 사용해 주세요.');
      return;
    }
    if (!resolveAttachmentFileMime(file.type, file.name)) {
      setUploadErr('지원하지 않는 파일 형식입니다. (PDF, Office, TXT, CSV, ZIP)');
      return;
    }
    if (file.size > ATTACHMENT_FILE_MAX_BYTES) {
      setUploadErr('파일 크기는 20MB 이하여야 합니다.');
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadMentoringApplicationFile(fd);
    if (res.error || !res.data) {
      setUploadErr(res.error ?? '업로드에 실패했습니다.');
    } else {
      setAttachments((prev) => [...prev, res.data!]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function openImagePicker() {
    if (!canAddMore) return;
    setUploadErr(null);
    if (isNative) {
      setUploading(true);
      postToNative({
        type: 'PICK_IMAGE',
        payload: { source: 'gallery', context: 'mentoring' },
      });
      return;
    }
    imageInputRef.current?.click();
  }

  function openFilePicker() {
    if (!canAddMore) return;
    setUploadErr(null);
    if (isNative) {
      setUploading(true);
      postToNative({ type: 'PICK_FILE', payload: { context: 'mentoring' } });
      return;
    }
    fileInputRef.current?.click();
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

  const placeholder = useMemo(() => {
    if (isClinic) return '문제·풀이 과정·헷갈리는 개념 등을 자세히 적어주세요.';
    if (slot.type === 'consult') return '상담 받고 싶은 내용을 자세히 적어주세요.';
    return '멘토에게 전달할 내용을 자세히 적어주세요.';
  }, [isClinic, slot.type]);

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
              placeholder={placeholder}
              maxLength={CONTENT_MAX}
              required
            />
            <p className='text-muted-foreground mt-1 text-xs'>
              {content.length}/{CONTENT_MAX} (최소 {CONTENT_MIN}자)
            </p>
          </div>

          <div>
            <span className='text-sm font-medium'>첨부 (이미지·파일)</span>
            <input
              ref={imageInputRef}
              type='file'
              accept='image/jpeg,image/png,image/webp,image/gif'
              multiple
              className='hidden'
              onChange={(e) => handlePickImages(e.target.files)}
            />
            <input
              ref={fileInputRef}
              type='file'
              accept={ATTACHMENT_FILE_ACCEPT}
              className='hidden'
              onChange={(e) => handlePickDataFile(e.target.files?.[0] ?? null)}
            />
            {attachmentsBlocked ? (
              <p className='text-muted-foreground bg-muted/40 mt-2 rounded-lg border border-dashed p-3 text-xs'>
                앱 최신 버전(1.1 이상)에서 첨부 기능을 사용할 수 있습니다. 앱을 업데이트해 주세요.
              </p>
            ) : (
              <>
                <div className='mt-2 flex flex-wrap gap-2'>
                  {attachments.map((att, idx) =>
                    att.mime_type?.startsWith('image/') ? (
                      <div
                        key={`${att.url}-${idx}`}
                        className='relative size-20 overflow-hidden rounded-lg border'
                      >
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
                    ) : (
                      <div
                        key={`${att.url}-${idx}`}
                        className='bg-muted inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs'
                      >
                        <Paperclip className='size-3.5 flex-shrink-0' />
                        <span className='max-w-[160px] truncate'>{att.name}</span>
                        <button
                          type='button'
                          onClick={() => handleRemoveAttachment(idx)}
                          className='hover:bg-foreground/10 ml-1 rounded-full p-0.5'
                          aria-label='첨부 삭제'
                        >
                          <X className='size-3.5' />
                        </button>
                      </div>
                    ),
                  )}
                </div>
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                  <button
                    type='button'
                    onClick={openImagePicker}
                    disabled={!canAddMore}
                    className={cn(
                      'text-muted-foreground inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors',
                      'hover:bg-muted/50 disabled:opacity-50',
                    )}
                  >
                    <ImagePlus className='size-4' />
                    <span>이미지</span>
                  </button>
                  <button
                    type='button'
                    onClick={openFilePicker}
                    disabled={!canAddMore}
                    className={cn(
                      'text-muted-foreground inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors',
                      'hover:bg-muted/50 disabled:opacity-50',
                    )}
                  >
                    <Paperclip className='size-4' />
                    <span>파일</span>
                  </button>
                  <span className='text-muted-foreground text-xs'>
                    {uploading ? '업로드 중…' : `(${attachments.length}/${MAX_ATTACHMENTS})`}
                  </span>
                </div>
                <p className='text-muted-foreground mt-1 text-xs'>
                  이미지 10MB · 파일 20MB까지, 합쳐서 최대 {MAX_ATTACHMENTS}개.
                </p>
              </>
            )}
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
