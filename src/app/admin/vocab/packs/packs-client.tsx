'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createVocabPack,
  updateVocabPack,
  deleteOrDisableVocabPack,
  type AdminPackRow,
  type PackInput,
} from '@/lib/actions/vocab';

const STATUS_LABEL: Record<AdminPackRow['status'], string> = {
  preparing: '준비중',
  public: '공개',
  hidden: '숨김',
  disabled: '사용중지',
};
const STATUS_VARIANT: Record<AdminPackRow['status'], 'success' | 'muted' | 'warning' | 'danger'> = {
  preparing: 'muted',
  public: 'success',
  hidden: 'warning',
  disabled: 'danger',
};

type FormState = PackInput & { id?: string };
const EMPTY: FormState = {
  name: '',
  code: '',
  description: '',
  displayOrder: 0,
  status: 'preparing',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short' });
}

export default function PacksClient({ initialPacks }: { initialPacks: AdminPackRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setError(null);
    setForm({ ...EMPTY });
  }
  function openEdit(p: AdminPackRow) {
    setError(null);
    setForm({
      id: p.id,
      name: p.name,
      code: p.code,
      description: p.description ?? '',
      displayOrder: p.displayOrder,
      status: p.status,
      publishStartAt: p.publishStartAt,
      publishEndAt: p.publishEndAt,
    });
  }

  function save(force = false) {
    if (!form) return;
    setError(null);
    startTransition(async () => {
      if (form.id) {
        const res = await updateVocabPack(form.id, form, { force });
        if (res.needsConfirm) {
          if (confirm(res.needsConfirm)) return save(true);
          return;
        }
        if (res.error) return setError(res.error);
      } else {
        const res = await createVocabPack(form);
        if (res.error) return setError(res.error);
      }
      setForm(null);
      router.refresh();
    });
  }

  function removeOrDisable(p: AdminPackRow) {
    const msg = p.hasExamRecords
      ? `'${p.name}'은 시험 기록이 있어 삭제 대신 사용중지됩니다. 진행할까요?`
      : `'${p.name}'을 완전히 삭제할까요?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const res = await deleteOrDisableVocabPack(p.id);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }

  const inputCls = 'rounded-xl border border-gray-200 px-3 py-2 text-sm w-full';

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <span className='text-text-muted text-sm'>{initialPacks.length}개 꾸러미</span>
        <Button size='sm' onClick={openCreate}>
          + 새 꾸러미
        </Button>
      </div>

      {error && <p className='bg-error/10 text-error rounded-xl px-3 py-2 text-sm'>{error}</p>}

      {/* 등록/수정 폼 */}
      {form && (
        <div className='border-primary/30 space-y-3 rounded-2xl border bg-white p-4'>
          <h3 className='text-text font-semibold'>{form.id ? '꾸러미 수정' : '새 꾸러미'}</h3>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              꾸러미명 *
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              관리코드 *
              <input
                className={inputCls}
                value={form.code}
                disabled={!!form.id}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs sm:col-span-2'>
              설명
              <input
                className={inputCls}
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              표시 순서
              <input
                type='number'
                className={inputCls}
                value={form.displayOrder ?? 0}
                onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
              />
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              상태
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as PackInput['status'] })
                }
              >
                <option value='preparing'>준비중</option>
                <option value='public'>공개</option>
                <option value='hidden'>숨김</option>
                <option value='disabled'>사용중지</option>
              </select>
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              공개 시작일
              <input
                type='date'
                className={inputCls}
                value={form.publishStartAt ? form.publishStartAt.slice(0, 10) : ''}
                onChange={(e) => setForm({ ...form, publishStartAt: e.target.value || null })}
              />
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              공개 종료일
              <input
                type='date'
                className={inputCls}
                value={form.publishEndAt ? form.publishEndAt.slice(0, 10) : ''}
                onChange={(e) => setForm({ ...form, publishEndAt: e.target.value || null })}
              />
            </label>
          </div>
          <div className='flex gap-2'>
            <Button size='sm' onClick={() => save()} disabled={pending}>
              {pending ? '저장 중…' : '저장'}
            </Button>
            <Button size='sm' variant='ghost' onClick={() => setForm(null)}>
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className='overflow-x-auto rounded-2xl border border-gray-200'>
        <table className='w-full min-w-[760px] text-sm'>
          <thead className='text-text-muted bg-gray-50'>
            <tr>
              {[
                '꾸러미명',
                '코드',
                '등록단어',
                '사용가능',
                '상태',
                '순서',
                '등록일',
                '수정일',
                '',
              ].map((h) => (
                <th key={h} className='px-3 py-2 text-left font-medium whitespace-nowrap'>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {initialPacks.length === 0 ? (
              <tr>
                <td colSpan={9} className='text-text-muted px-3 py-8 text-center'>
                  등록된 꾸러미가 없습니다.
                </td>
              </tr>
            ) : (
              initialPacks.map((p) => (
                <tr key={p.id} className='border-t border-gray-100'>
                  <td className='px-3 py-2 font-medium whitespace-nowrap'>{p.name}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{p.code}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{p.totalWords}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <span className={p.activeWords < 40 ? 'text-error' : ''}>{p.activeWords}</span>
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>{p.displayOrder}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{fmtDate(p.createdAt)}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{fmtDate(p.updatedAt)}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <div className='flex gap-2'>
                      <button onClick={() => openEdit(p)} className='text-primary hover:underline'>
                        수정
                      </button>
                      <button
                        onClick={() => removeOrDisable(p)}
                        className='text-error hover:underline'
                      >
                        {p.hasExamRecords ? '사용중지' : '삭제'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
