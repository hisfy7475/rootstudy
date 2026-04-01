'use client';

import { useMemo, useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Mentor } from '@/types/database';
import { createMentor, updateMentor, type MentorAdminInput } from '@/lib/actions/mentoring';

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

  const filtered = useMemo(() => {
    if (filter === 'all') return mentors;
    if (filter === 'active') return mentors.filter((m) => m.is_active);
    return mentors.filter((m) => !m.is_active);
  }, [mentors, filter]);

  function startCreate() {
    setEditingId('new');
    setForm({
      name: '',
      subject: '',
      bio: '',
      profile_image_url: '',
      is_active: true,
    });
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
    setError(null);
  }

  function cancelForm() {
    setEditingId(null);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      if (editingId === 'new') {
        const res = await createMentor(form);
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.data) setMentors((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
        setEditingId(null);
        return;
      }
      if (editingId) {
        const res = await updateMentor(editingId, form);
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.data) {
          setMentors((prev) => prev.map((m) => (m.id === editingId ? res.data! : m)));
        }
        setEditingId(null);
      }
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
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">프로필 이미지 URL (선택)</span>
            <input
              className="border-input w-full rounded-xl border px-3 py-2"
              value={form.profile_image_url ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, profile_image_url: e.target.value }))}
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
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
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
