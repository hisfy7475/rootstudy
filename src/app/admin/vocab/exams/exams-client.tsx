'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getAdminVocabExams,
  getVocabExamsForExport,
  type AdminExamRow,
  type AdminExamFilters,
} from '@/lib/actions/vocab';

type Option = { id: string; name: string };

const TYPE_LABEL = { normal: '일반', friday_review: '금요일 오답' } as const;
const STATUS_LABEL = { in_progress: '진행 중', normal: '정상 제출', auto: '자동 제출' } as const;

function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export default function ExamsClient({
  initialRows,
  packs,
  studentTypes,
  branches,
  isSuperAdmin,
}: {
  initialRows: AdminExamRow[];
  packs: Option[];
  studentTypes: Option[];
  branches: Option[];
  isSuperAdmin: boolean;
}) {
  const [rows, setRows] = useState<AdminExamRow[]>(initialRows);
  const [filters, setFilters] = useState<AdminExamFilters>({});
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  function set<K extends keyof AdminExamFilters>(key: K, value: AdminExamFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value === '' || value === undefined ? undefined : value }));
  }

  function search() {
    startTransition(async () => {
      const r = await getAdminVocabExams(filters);
      setRows(r);
    });
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const data = await getVocabExamsForExport(filters);
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '응시내역');
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
      XLSX.writeFile(wb, `영단어시험_응시내역_${today}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  const inputCls = 'rounded-xl border border-gray-200 px-3 py-2 text-sm';

  return (
    <div className='space-y-4'>
      {/* 검색 필터 */}
      <div className='grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-4'>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          시작일
          <input
            type='date'
            className={inputCls}
            onChange={(e) => set('fromDate', e.target.value)}
          />
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          종료일
          <input type='date' className={inputCls} onChange={(e) => set('toDate', e.target.value)} />
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          학생명
          <input
            className={inputCls}
            placeholder='이름'
            onChange={(e) => set('studentSearch', e.target.value)}
          />
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          자리번호
          <input
            type='number'
            className={inputCls}
            onChange={(e) => set('seatNumber', e.target.value ? Number(e.target.value) : undefined)}
          />
        </label>
        {isSuperAdmin && (
          <label className='text-text-muted flex flex-col gap-1 text-xs'>
            센터
            <select className={inputCls} onChange={(e) => set('branchId', e.target.value)}>
              <option value=''>전체</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          그룹
          <select className={inputCls} onChange={(e) => set('studentTypeId', e.target.value)}>
            <option value=''>전체</option>
            {studentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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
          시험 구분
          <select
            className={inputCls}
            onChange={(e) =>
              set('examType', (e.target.value || undefined) as AdminExamFilters['examType'])
            }
          >
            <option value=''>전체</option>
            <option value='normal'>일반</option>
            <option value='friday_review'>금요일 오답</option>
          </select>
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          제출 상태
          <select
            className={inputCls}
            onChange={(e) =>
              set('submitStatus', (e.target.value || undefined) as AdminExamFilters['submitStatus'])
            }
          >
            <option value=''>전체</option>
            <option value='in_progress'>진행 중</option>
            <option value='normal'>정상 제출</option>
            <option value='auto'>자동 제출</option>
          </select>
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          최소 점수
          <input
            type='number'
            className={inputCls}
            onChange={(e) => set('scoreMin', e.target.value ? Number(e.target.value) : undefined)}
          />
        </label>
        <label className='text-text-muted flex flex-col gap-1 text-xs'>
          최대 점수
          <input
            type='number'
            className={inputCls}
            onChange={(e) => set('scoreMax', e.target.value ? Number(e.target.value) : undefined)}
          />
        </label>
      </div>

      <div className='flex items-center justify-between'>
        <div className='flex gap-2'>
          <Button size='sm' onClick={search} disabled={pending}>
            {pending ? '조회 중…' : '조회'}
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={exportExcel}
            disabled={exporting || rows.length === 0}
          >
            {exporting ? '내보내는 중…' : '엑셀 다운로드'}
          </Button>
        </div>
        <span className='text-text-muted text-sm'>{rows.length}건</span>
      </div>

      {/* 목록 */}
      <div className='overflow-x-auto rounded-2xl border border-gray-200'>
        <table className='w-full min-w-[900px] text-sm'>
          <thead className='text-text-muted bg-gray-50'>
            <tr>
              {[
                '학생',
                '그룹',
                '자리',
                '센터',
                '시험날짜',
                '시작',
                '제출일시',
                '꾸러미',
                '구분',
                '점수',
                '제출방식',
                '',
              ].map((h) => (
                <th key={h} className='px-3 py-2 text-left font-medium whitespace-nowrap'>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className='text-text-muted px-3 py-8 text-center'>
                  응시 내역이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.examId} className='border-t border-gray-100'>
                  <td className='px-3 py-2 whitespace-nowrap'>{r.studentName}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{r.groupName ?? '-'}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{r.seatNumber ?? '-'}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{r.branchName ?? '-'}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{r.examDate}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{fmtDateTime(r.startedAt)}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{fmtDateTime(r.submittedAt)}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>{r.packName}</td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <Badge variant={r.examType === 'friday_review' ? 'warning' : 'muted'}>
                      {TYPE_LABEL[r.examType]}
                    </Badge>
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    {r.score === null ? '-' : `${r.score}/${r.total}`}
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <Badge
                      variant={
                        r.submitStatus === 'auto'
                          ? 'warning'
                          : r.submitStatus === 'normal'
                            ? 'success'
                            : 'info'
                      }
                    >
                      {STATUS_LABEL[r.submitStatus]}
                    </Badge>
                  </td>
                  <td className='px-3 py-2 whitespace-nowrap'>
                    <Link
                      href={`/admin/vocab/exams/${r.examId}`}
                      className='text-primary hover:underline'
                    >
                      상세
                    </Link>
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
