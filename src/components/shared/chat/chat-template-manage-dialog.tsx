'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  createChatTemplate,
  deleteChatTemplate,
  listChatTemplates,
  reorderChatTemplates,
  updateChatTemplate,
  type ChatMessageTemplate,
} from '@/lib/actions/chat';
import { toast } from 'sonner';

interface ChatTemplateManageDialogProps {
  onClose: () => void;
  onChanged?: () => void;
}

const TITLE_MAX = 30;
const CONTENT_MAX = 2000;
const TOTAL_MAX = 30;

export function ChatTemplateManageDialog({ onClose, onChanged }: ChatTemplateManageDialogProps) {
  const [items, setItems] = useState<ChatMessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const refresh = async () => {
    setLoading(true);
    const res = await listChatTemplates();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setItems(res.data ?? []);
  };

  useEffect(() => {
    // 모달이 열리는 시점에 1회 외부 시스템(서버)에서 동기화 — 의도된 fetch-on-mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const notifyChanged = () => onChanged?.();

  const handleCreate = async () => {
    if (busy) return;
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title || !content) {
      toast.error('제목과 본문을 입력해주세요.');
      return;
    }
    if (items.length >= TOTAL_MAX) {
      toast.error('템플릿은 최대 30개까지 추가할 수 있습니다.');
      return;
    }
    setBusy(true);
    const res = await createChatTemplate({ title, content });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setNewTitle('');
    setNewContent('');
    await refresh();
    notifyChanged();
  };

  const startEdit = (t: ChatMessageTemplate) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditContent(t.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || busy) return;
    const title = editTitle.trim();
    const content = editContent.trim();
    if (!title || !content) {
      toast.error('제목과 본문을 입력해주세요.');
      return;
    }
    setBusy(true);
    const res = await updateChatTemplate(editingId, { title, content });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    cancelEdit();
    await refresh();
    notifyChanged();
  };

  const handleDelete = async (id: string) => {
    if (busy) return;
    if (!window.confirm('이 템플릿을 삭제하시겠습니까?')) return;
    setBusy(true);
    const res = await deleteChatTemplate(id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    await refresh();
    notifyChanged();
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (busy) return;
    const next = index + dir;
    if (next < 0 || next >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(next, 0, moved);
    setItems(reordered);
    setBusy(true);
    const res = await reorderChatTemplates(reordered.map((t) => t.id));
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      await refresh();
      return;
    }
    notifyChanged();
  };

  return (
    <div
      className='fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4'
      onClick={onClose}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-label='자주 쓰는 멘트 관리'
        className='flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-center justify-between border-b border-gray-200 px-4 py-3'>
          <h2 className='text-text font-semibold'>자주 쓰는 멘트 관리</h2>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full p-1.5 hover:bg-gray-100'
            aria-label='닫기'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='flex-1 overflow-y-auto p-4'>
          {/* 새 항목 추가 */}
          <div className='mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3'>
            <div className='text-text mb-2 text-sm font-semibold'>새 멘트 추가</div>
            <input
              type='text'
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder='제목 (예: 입실 안내)'
              className='mb-2 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm'
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              maxLength={CONTENT_MAX}
              rows={3}
              placeholder='본문'
              className='w-full resize-none rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm'
            />
            <div className='mt-2 flex items-center justify-between'>
              <span className='text-text-muted text-xs'>
                {items.length}/{TOTAL_MAX}개
              </span>
              <button
                type='button'
                onClick={handleCreate}
                disabled={busy || !newTitle.trim() || !newContent.trim()}
                className={cn(
                  'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium',
                  'bg-primary hover:bg-primary/90 text-white',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <Plus className='h-4 w-4' />
                추가
              </button>
            </div>
          </div>

          {/* 목록 */}
          {loading ? (
            <div className='text-text-muted py-6 text-center text-sm'>불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className='text-text-muted py-6 text-center text-sm'>
              아직 등록된 멘트가 없습니다.
            </div>
          ) : (
            <ul className='space-y-2'>
              {items.map((t, idx) => (
                <li key={t.id} className='rounded-lg border border-gray-200 p-3'>
                  {editingId === t.id ? (
                    <div className='space-y-2'>
                      <input
                        type='text'
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={TITLE_MAX}
                        className='w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm'
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        maxLength={CONTENT_MAX}
                        rows={3}
                        className='w-full resize-none rounded-md border border-gray-200 px-2 py-1.5 text-sm'
                      />
                      <div className='flex justify-end gap-2'>
                        <button
                          type='button'
                          onClick={cancelEdit}
                          className='rounded-md px-3 py-1 text-sm hover:bg-gray-100'
                        >
                          취소
                        </button>
                        <button
                          type='button'
                          onClick={handleSaveEdit}
                          disabled={busy}
                          className='bg-primary hover:bg-primary/90 rounded-md px-3 py-1 text-sm text-white disabled:opacity-50'
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className='flex items-start gap-2'>
                      <div className='flex flex-col gap-1 pt-1'>
                        <button
                          type='button'
                          onClick={() => move(idx, -1)}
                          disabled={busy || idx === 0}
                          className='rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30'
                          aria-label='위로'
                        >
                          <ArrowUp className='h-3.5 w-3.5' />
                        </button>
                        <button
                          type='button'
                          onClick={() => move(idx, 1)}
                          disabled={busy || idx === items.length - 1}
                          className='rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30'
                          aria-label='아래로'
                        >
                          <ArrowDown className='h-3.5 w-3.5' />
                        </button>
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='text-text truncate text-sm font-medium'>{t.title}</div>
                        <div className='text-text-muted mt-0.5 text-xs whitespace-pre-wrap'>
                          {t.content}
                        </div>
                      </div>
                      <div className='flex flex-shrink-0 items-center gap-1'>
                        <button
                          type='button'
                          onClick={() => startEdit(t)}
                          className='rounded-md p-1.5 text-gray-500 hover:bg-gray-100'
                          aria-label='수정'
                        >
                          <Pencil className='h-3.5 w-3.5' />
                        </button>
                        <button
                          type='button'
                          onClick={() => handleDelete(t.id)}
                          className='rounded-md p-1.5 text-red-500 hover:bg-red-50'
                          aria-label='삭제'
                        >
                          <Trash2 className='h-3.5 w-3.5' />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
