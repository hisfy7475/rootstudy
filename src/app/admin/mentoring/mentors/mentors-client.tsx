'use client';

import { useMemo, useRef, useState, useTransition, type ChangeEvent, type DragEvent } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import type { Mentor } from '@/types/database';
import {
  createMentor,
  updateMentor,
  uploadMentorProfileImage,
  deleteMentorProfileImage,
  type MentorAdminInput,
} from '@/lib/actions/mentoring';

type Filter = 'all' | 'active' | 'inactive';

interface Props {
  initialMentors: Mentor[];
}

export function AdminMentorsClient({ initialMentors }: Props) {
  const [mentors, setMentors] = useState(initialMentors);
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MentorAdminInput>({
    name: '',
    subject: '',
    bio: '',
    profile_image_url: '',
    is_active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDeleted, setImageDeleted] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'all') return mentors;
    if (filter === 'active') return mentors.filter((m) => m.is_active);
    return mentors.filter((m) => !m.is_active);
  }, [mentors, filter]);

  function resetImageState() {
    setPendingFile(null);
    setPreviewUrl(null);
    setImageDeleted(false);
    setDragOver(false);
  }

  function startCreate() {
    setEditingId('new');
    setForm({ name: '', subject: '', bio: '', profile_image_url: '', is_active: true });
    resetImageState();
    setError(null);
  }

  function startEdit(m: Mentor) {
    setEditingId(m.id);
    setForm({
      name: m.name,
      subject: m.subject ?? '',
      bio: m.bio ?? '',
      profile_image_url: m.profile_image_url ?? '',
      is_active: m.is_active,
    });
    resetImageState();
    setPreviewUrl(m.profile_image_url ?? null);
    setError(null);
  }

  function cancelForm() {
    setEditingId(null);
    resetImageState();
    setError(null);
  }

  function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setImageDeleted(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function handleImageDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPendingFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setImageDeleted(false);
    }
  }

  function handleImageRemove() {
    setPendingFile(null);
    setPreviewUrl(null);
    setImageDeleted(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      let mentorId: string;
      let mentorData: Mentor;

      if (editingId === 'new') {
        const res = await createMentor({ ...form, profile_image_url: '' });
        if (res.error) { setError(res.error); return; }
        mentorId = res.data!.id;
        mentorData = res.data!;
      } else if (editingId) {
        const res = await updateMentor(editingId, {
          name: form.name,
          subject: form.subject,
          bio: form.bio,
          is_active: form.is_active,
        });
        if (res.error) { setError(res.error); return; }
        mentorId = editingId;
        mentorData = res.data!;
      } else {
        return;
      }

      if (pendingFile) {
        const fd = new FormData();
        fd.append('file', pendingFile);
        const imgRes = await uploadMentorProfileImage(mentorId, fd);
        if (imgRes.error) { setError(imgRes.error); return; }
        mentorData = { ...mentorData, profile_image_url: imgRes.data!.url };
      } else if (imageDeleted && editingId !== 'new') {
        const delRes = await deleteMentorProfileImage(mentorId);
        if (delRes.error) { setError(delRes.error); return; }
        mentorData = { ...mentorData, profile_image_url: null };
      }

      if (editingId === 'new') {
        setMentors((prev) => [...prev, mentorData].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setMentors((prev) => prev.map((m) => (m.id === mentorId ? mentorData : m)));
      }
      setEditingId(null);
      resetImageState();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', '전체'],
            ['active', '활성'],
            ['inactive', '비활성'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === k
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={startCreate}
          className="bg-primary text-primary-foreground ml-auto rounded-2xl px-4 py-1.5 text-sm font-medium hover:bg-primary/90"
        >
          멘토 추가
        </button>
      </div>

      {editingId && (
        <Card className="space-y-4 p-4">
          <h2 className="font-semibold">{editingId === 'new' ? '멘토 등록' : '멘토 수정'}</h2>
          {error && <p className="text-destructive text-sm">{error}</p>}

          {/* 프로필 이미지 — 원형, 상단 중앙 */}
          <div className="flex flex-col items-center gap-2">
            <div
              className={cn(
                'relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-dashed transition-colors cursor-pointer',
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              )}
              onClick={() => imageInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleImageDrop}
            >
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="프로필 미리보기"
                  width={96}
                  height={96}
                  className="size-full object-cover"
                  unoptimized={previewUrl.startsWith('http') || previewUrl.startsWith('blob:')}
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center text-muted-foreground">
                  <ImagePlus className="size-6" />
                </div>
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleImageSelect}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={pending}
                className="text-xs font-medium text-primary hover:underline"
              >
                {previewUrl ? '변경' : '사진 등록'}
              </button>
              {previewUrl && (
                <button
                  type="button"
                  onClick={handleImageRemove}
                  disabled={pending}
                  className="text-xs font-medium text-destructive hover:underline"
                >
                  삭제
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">이름</span>
              <input
                className="border-input w-full rounded-xl border px-3 py-2"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">주요 과목</span>
              <input
                className="border-input w-full rounded-xl border px-3 py-2"
                value={form.subject ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">소개</span>
            <textarea
              className="border-input min-h-[80px] w-full rounded-xl border px-3 py-2"
              value={form.bio ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              저장
            </button>
            <button type="button" onClick={cancelForm} className="rounded-xl border px-4 py-2 text-sm">
              취소
            </button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b text-left">
            <tr>
              <th className="p-3 font-medium">이름</th>
              <th className="p-3 font-medium">과목</th>
              <th className="p-3 font-medium">상태</th>
              <th className="p-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{m.name}</td>
                <td className="text-muted-foreground p-3">{m.subject ?? '—'}</td>
                <td className="p-3">{m.is_active ? '활성' : '비활성'}</td>
                <td className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => startEdit(m)}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    수정
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
