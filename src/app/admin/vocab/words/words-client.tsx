'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getAdminVocabWords,
  createVocabWord,
  updateVocabWord,
  setVocabWordActive,
  importVocabWords,
  type AdminWordRow,
  type WordFilters,
  type WordInput,
  type ImportRow,
  type ImportResult,
} from '@/lib/actions/vocab';

type Option = { id: string; name: string };
type DupPolicy = 'keep' | 'update' | 'skip';

type FormState = WordInput & { id?: string };
const EMPTY: FormState = {
  english: '',
  koreanPrimary: '',
  koreanExtra: '',
  problemGroup: '',
  isActive: true,
  packIds: [],
};

function parseActive(v: unknown): boolean {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (['n', 'no', 'false', '0', '사용안함', '미사용'].includes(s)) return false;
  return true;
}

export default function WordsClient({
  initialWords,
  packs,
}: {
  initialWords: AdminWordRow[];
  packs: Option[];
}) {
  const router = useRouter();
  const packName = new Map(packs.map((p) => [p.id, p.name]));
  const [words, setWords] = useState<AdminWordRow[]>(initialWords);
  const [filters, setFilters] = useState<WordFilters>({});
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 엑셀 업로드 상태
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [dupPolicy, setDupPolicy] = useState<DupPolicy>('keep');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  function set<K extends keyof WordFilters>(key: K, value: WordFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value === '' || value === undefined ? undefined : value }));
  }
  function refetch() {
    startTransition(async () => setWords(await getAdminVocabWords(filters)));
  }

  function saveWord() {
    if (!form) return;
    setError(null);
    startTransition(async () => {
      const res = form.id ? await updateVocabWord(form.id, form) : await createVocabWord(form);
      if (res.error) return setError(res.error);
      setForm(null);
      setWords(await getAdminVocabWords(filters));
      router.refresh();
    });
  }
  function toggleActive(w: AdminWordRow) {
    startTransition(async () => {
      const res = await setVocabWordActive(w.id, !w.isActive);
      if (res.error) return setError(res.error);
      setWords(await getAdminVocabWords(filters));
    });
  }

  // ----- 엑셀 -----
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const rows: ImportRow[] = raw.map((r) => ({
      packCode: String(r['꾸러미코드'] ?? '').trim(),
      english: String(r['영어단어'] ?? '').trim(),
      koreanPrimary: String(r['한국어 대표뜻'] ?? r['대표뜻'] ?? '').trim(),
      koreanExtra: String(r['추가뜻'] ?? '').trim() || null,
      problemGroup: String(r['문제그룹'] ?? '').trim() || null,
      isActive: parseActive(r['사용여부']),
    }));
    setImportRows(rows);
  }
  function runImport() {
    if (!importRows) return;
    startTransition(async () => {
      const res = await importVocabWords(importRows, dupPolicy);
      if (res.error) return setError(res.error);
      setImportResult(res.result ?? null);
      setWords(await getAdminVocabWords(filters));
      router.refresh();
    });
  }
  async function downloadTemplate() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet([
      {
        꾸러미코드: 'LEVEL1',
        꾸러미명: 'LEVEL 1',
        영어단어: 'apple',
        '한국어 대표뜻': '사과',
        추가뜻: '',
        문제그룹: 'Day1',
        사용여부: '사용',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '단어');
    XLSX.writeFile(wb, '영단어_업로드_템플릿.xlsx');
  }
  async function downloadErrors() {
    if (!importResult || !importRows) return;
    const XLSX = await import('xlsx');
    const data = importResult.errors.map((e) => ({
      행: e.rowIndex + 2,
      꾸러미코드: importRows[e.rowIndex]?.packCode ?? '',
      영어단어: importRows[e.rowIndex]?.english ?? '',
      오류사유: e.reason,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '오류');
    XLSX.writeFile(wb, '영단어_업로드_오류.xlsx');
  }

  const inputCls = 'rounded-xl border border-gray-200 px-3 py-2 text-sm w-full';

  return (
    <div className='space-y-4'>
      {error && <p className='bg-error/10 text-error rounded-xl px-3 py-2 text-sm'>{error}</p>}

      {/* 엑셀 업로드 */}
      <details className='rounded-2xl border border-gray-200 bg-white p-4'>
        <summary className='text-text cursor-pointer font-semibold'>엑셀 업로드</summary>
        <div className='mt-3 space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <input type='file' accept='.xlsx,.xls' onChange={onFile} className='text-sm' />
            <Button size='sm' variant='ghost' onClick={downloadTemplate}>
              템플릿 다운로드
            </Button>
          </div>
          {importRows && (
            <div className='space-y-2'>
              <p className='text-text-muted text-sm'>{importRows.length}행 읽음. 중복 단어 처리:</p>
              <div className='flex flex-wrap items-center gap-3 text-sm'>
                {(['keep', 'update', 'skip'] as DupPolicy[]).map((p) => (
                  <label key={p} className='flex items-center gap-1'>
                    <input
                      type='radio'
                      name='dup'
                      checked={dupPolicy === p}
                      onChange={() => setDupPolicy(p)}
                    />
                    {p === 'keep'
                      ? '기존 유지(연결만)'
                      : p === 'update'
                        ? '기존 수정(⚠️연결된 모든 꾸러미 영향)'
                        : '중복행 제외'}
                  </label>
                ))}
              </div>
              <Button size='sm' onClick={runImport} disabled={pending}>
                {pending ? '등록 중…' : '업로드 실행'}
              </Button>
            </div>
          )}
          {importResult && (
            <div className='rounded-xl bg-gray-50 p-3 text-sm'>
              <p>
                신규 {importResult.inserted} · 연결 {importResult.linked} · 수정{' '}
                {importResult.updated} · 제외 {importResult.skipped} · 오류{' '}
                {importResult.errors.length}
              </p>
              {importResult.errors.length > 0 && (
                <Button size='sm' variant='outline' className='mt-2' onClick={downloadErrors}>
                  오류행 다운로드
                </Button>
              )}
            </div>
          )}
        </div>
      </details>

      {/* 검색 */}
      <div className='grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-4'>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          영어 단어
          <input className={inputCls} onChange={(e) => set('english', e.target.value)} />
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          한국어 뜻
          <input className={inputCls} onChange={(e) => set('korean', e.target.value)} />
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          문제 그룹
          <input className={inputCls} onChange={(e) => set('problemGroup', e.target.value)} />
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          단어 꾸러미
          <select className={inputCls} onChange={(e) => set('packId', e.target.value)}>
            <option value=''>전체</option>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          사용 여부
          <select
            className={inputCls}
            onChange={(e) =>
              set('isActive', e.target.value === '' ? undefined : e.target.value === 'true')
            }
          >
            <option value=''>전체</option>
            <option value='true'>사용</option>
            <option value='false'>사용안함</option>
          </select>
        </label>
      </div>

      <div className='flex items-center justify-between'>
        <div className='flex gap-2'>
          <Button size='sm' onClick={refetch} disabled={pending}>
            조회
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              setError(null);
              setForm({ ...EMPTY });
            }}
          >
            + 새 단어
          </Button>
        </div>
        <span className='text-text-muted text-sm'>{words.length}개</span>
      </div>

      {/* 단어 폼 */}
      {form && (
        <div className='border-primary/30 space-y-3 rounded-2xl border bg-white p-4'>
          <h3 className='text-text font-semibold'>{form.id ? '단어 수정' : '새 단어'}</h3>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              영어 단어 *
              <input
                className={inputCls}
                value={form.english}
                disabled={!!form.id}
                onChange={(e) => setForm({ ...form, english: e.target.value })}
              />
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              대표 뜻 *
              <input
                className={inputCls}
                value={form.koreanPrimary}
                onChange={(e) => setForm({ ...form, koreanPrimary: e.target.value })}
              />
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              추가 뜻
              <input
                className={inputCls}
                value={form.koreanExtra ?? ''}
                onChange={(e) => setForm({ ...form, koreanExtra: e.target.value })}
              />
            </label>
            <label className='text-text-muted flex flex-col gap-1 text-xs'>
              문제 그룹
              <input
                className={inputCls}
                value={form.problemGroup ?? ''}
                onChange={(e) => setForm({ ...form, problemGroup: e.target.value })}
              />
            </label>
          </div>
          <div>
            <p className='text-text-muted mb-1 text-xs'>연결 꾸러미</p>
            <div className='flex flex-wrap gap-2'>
              {packs.map((p) => {
                const checked = form.packIds?.includes(p.id) ?? false;
                return (
                  <label
                    key={p.id}
                    className='flex items-center gap-1 rounded-xl border border-gray-200 px-2 py-1 text-sm'
                  >
                    <input
                      type='checkbox'
                      checked={checked}
                      onChange={(e) => {
                        const cur = new Set(form.packIds ?? []);
                        if (e.target.checked) cur.add(p.id);
                        else cur.delete(p.id);
                        setForm({ ...form, packIds: [...cur] });
                      }}
                    />
                    {p.name}
                  </label>
                );
              })}
            </div>
          </div>
          <label className='flex items-center gap-2 text-sm'>
            <input
              type='checkbox'
              checked={form.isActive ?? true}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            사용
          </label>
          <div className='flex gap-2'>
            <Button size='sm' onClick={saveWord} disabled={pending}>
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
        <table className='w-full min-w-[820px] text-sm'>
          <thead className='text-text-muted bg-gray-50'>
            <tr>
              {['영어', '대표뜻', '추가뜻', '문제그룹', '꾸러미', '사용', ''].map((h) => (
                <th key={h} className='px-3 py-2 text-left font-medium whitespace-nowrap'>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {words.length === 0 ? (
              <tr>
                <td colSpan={7} className='text-text-muted px-3 py-8 text-center'>
                  단어가 없습니다.
                </td>
              </tr>
            ) : (
              words.map((w) => (
                <tr key={w.id} className='border-t border-gray-100'>
                  <td className='px-3 py-2 font-medium whitespace-nowrap'>{w.english}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{w.koreanPrimary}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{w.koreanExtra ?? '-'}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{w.problemGroup ?? '-'}</td>
                  <td className='px-3 py-2'>
                    <div className='flex flex-wrap gap-1'>
                      {w.packIds.map((pid) => (
                        <Badge key={pid} variant='muted'>
                          {packName.get(pid) ?? '?'}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <Badge variant={w.isActive ? 'success' : 'muted'}>
                      {w.isActive ? '사용' : '사용안함'}
                    </Badge>
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <div className='flex gap-2'>
                      <button
                        onClick={() => {
                          setError(null);
                          setForm({
                            id: w.id,
                            english: w.english,
                            koreanPrimary: w.koreanPrimary,
                            koreanExtra: w.koreanExtra ?? '',
                            problemGroup: w.problemGroup ?? '',
                            isActive: w.isActive,
                            packIds: w.packIds,
                          });
                        }}
                        className='text-primary hover:underline'
                      >
                        수정
                      </button>
                      <button
                        onClick={() => toggleActive(w)}
                        className='text-text-muted hover:underline'
                      >
                        {w.isActive ? '사용안함' : '사용'}
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
