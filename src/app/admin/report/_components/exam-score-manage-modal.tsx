'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Pencil, Trash2 } from 'lucide-react';
import {
  getExamScores,
  saveExamScore,
  deleteExamScore,
  type ExamScoreRow,
} from '@/lib/actions/report';

interface ExamScoreManageModalProps {
  studentId: string;
  studentName: string;
  onClose: () => void;
  /** 저장/삭제 후 부모가 리포트를 재조회하도록 알림 */
  onSaved: () => void;
}

interface FormState {
  id: string | null;
  examName: string;
  examType: string;
  examDate: string;
  subject: string;
  rawScore: string;
  standardScore: string;
  percentile: string;
  grade: string;
  memo: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  examName: '',
  examType: '모의고사',
  examDate: '',
  subject: '',
  rawScore: '',
  standardScore: '',
  percentile: '',
  grade: '',
  memo: '',
};

function toNum(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function ExamScoreManageModal({
  studentId,
  studentName,
  onClose,
  onSaved,
}: ExamScoreManageModalProps) {
  const [rows, setRows] = useState<ExamScoreRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await getExamScores(studentId);
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await getExamScores(studentId);
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const resetForm = () => setForm(EMPTY_FORM);

  const handleEdit = (row: ExamScoreRow) => {
    setForm({
      id: row.id,
      examName: row.examName,
      examType: row.examType,
      examDate: row.examDate,
      subject: row.subject,
      rawScore: row.rawScore !== null ? String(row.rawScore) : '',
      standardScore: row.standardScore !== null ? String(row.standardScore) : '',
      percentile: row.percentile !== null ? String(row.percentile) : '',
      grade: row.grade !== null ? String(row.grade) : '',
      memo: row.memo ?? '',
    });
  };

  const handleSave = async () => {
    if (!form.examName.trim()) return alert('시험명을 입력해주세요.');
    if (!form.examDate) return alert('시험일을 입력해주세요.');
    if (!form.subject.trim()) return alert('과목을 입력해주세요.');

    setSaving(true);
    try {
      const res = await saveExamScore({
        id: form.id ?? undefined,
        studentId,
        examName: form.examName.trim(),
        examType: form.examType.trim() || '모의고사',
        examDate: form.examDate,
        subject: form.subject.trim(),
        rawScore: toNum(form.rawScore),
        standardScore: toNum(form.standardScore),
        percentile: toNum(form.percentile),
        grade: toNum(form.grade),
        memo: form.memo.trim() || null,
      });
      if (!res.success) {
        alert(res.error || '저장에 실패했습니다.');
        return;
      }
      resetForm();
      await reload();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 성적을 삭제할까요?')) return;
    setSaving(true);
    try {
      const res = await deleteExamScore(id);
      if (!res.success) {
        alert(res.error || '삭제에 실패했습니다.');
        return;
      }
      if (form.id === id) resetForm();
      await reload();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='flex max-h-[90vh] w-full max-w-2xl flex-col space-y-4 overflow-hidden p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='text-lg font-semibold'>성적 관리 · {studentName}</h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        {/* 입력 폼 */}
        <div className='space-y-3 rounded-xl bg-gray-50 p-4'>
          <p className='text-text-muted text-xs font-semibold'>
            {form.id ? '성적 수정' : '성적 추가'}
          </p>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
            <div className='col-span-2 sm:col-span-1'>
              <label className='text-text-muted mb-1 block text-xs'>시험명</label>
              <Input
                placeholder='예: 6월 모의고사'
                value={form.examName}
                onChange={(e) => setForm((p) => ({ ...p, examName: e.target.value }))}
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-xs'>유형</label>
              <Input
                placeholder='모의고사'
                value={form.examType}
                onChange={(e) => setForm((p) => ({ ...p, examType: e.target.value }))}
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-xs'>시험일</label>
              <Input
                type='date'
                value={form.examDate}
                onChange={(e) => setForm((p) => ({ ...p, examDate: e.target.value }))}
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-xs'>과목</label>
              <Input
                placeholder='국어'
                value={form.subject}
                onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              />
            </div>
          </div>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            <div>
              <label className='text-text-muted mb-1 block text-xs'>원점수</label>
              <Input
                type='number'
                value={form.rawScore}
                onChange={(e) => setForm((p) => ({ ...p, rawScore: e.target.value }))}
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-xs'>표준점수</label>
              <Input
                type='number'
                value={form.standardScore}
                onChange={(e) => setForm((p) => ({ ...p, standardScore: e.target.value }))}
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-xs'>백분위</label>
              <Input
                type='number'
                value={form.percentile}
                onChange={(e) => setForm((p) => ({ ...p, percentile: e.target.value }))}
              />
            </div>
            <div>
              <label className='text-text-muted mb-1 block text-xs'>등급(1~9)</label>
              <Input
                type='number'
                min={1}
                max={9}
                value={form.grade}
                onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
              />
            </div>
          </div>
          <div className='flex gap-2'>
            {form.id && (
              <Button variant='outline' className='flex-1' onClick={resetForm} disabled={saving}>
                취소
              </Button>
            )}
            <Button className='flex-1' onClick={handleSave} disabled={saving}>
              {saving ? '처리중...' : form.id ? '수정 저장' : '추가'}
            </Button>
          </div>
        </div>

        {/* 기존 성적 목록 */}
        <div className='min-h-0 flex-1 overflow-y-auto'>
          {loading ? (
            <p className='text-text-muted py-6 text-center text-sm'>불러오는 중...</p>
          ) : rows.length === 0 ? (
            <p className='text-text-muted py-6 text-center text-sm'>등록된 성적이 없습니다.</p>
          ) : (
            <table className='w-full text-sm'>
              <thead className='bg-card text-text-muted sticky top-0 text-xs'>
                <tr className='border-b border-gray-200'>
                  <th className='px-2 py-2 text-left font-medium'>시험</th>
                  <th className='px-2 py-2 text-left font-medium'>과목</th>
                  <th className='px-2 py-2 text-right font-medium'>원점수</th>
                  <th className='px-2 py-2 text-right font-medium'>표준</th>
                  <th className='px-2 py-2 text-right font-medium'>백분위</th>
                  <th className='px-2 py-2 text-right font-medium'>등급</th>
                  <th className='px-2 py-2 text-right font-medium'>관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className='border-b border-gray-100'>
                    <td className='px-2 py-2'>
                      <span className='text-text'>{r.examName}</span>
                      <span className='text-text-muted ml-1 text-xs'>{r.examDate}</span>
                    </td>
                    <td className='text-text px-2 py-2'>{r.subject}</td>
                    <td className='text-text px-2 py-2 text-right'>{r.rawScore ?? '—'}</td>
                    <td className='text-text px-2 py-2 text-right'>{r.standardScore ?? '—'}</td>
                    <td className='text-text px-2 py-2 text-right'>{r.percentile ?? '—'}</td>
                    <td className='text-text px-2 py-2 text-right'>
                      {r.grade !== null ? `${r.grade}` : '—'}
                    </td>
                    <td className='px-2 py-2 text-right'>
                      <div className='flex justify-end gap-1'>
                        <button
                          onClick={() => handleEdit(r)}
                          className='text-text-muted hover:text-primary p-1'
                          title='수정'
                        >
                          <Pencil className='h-4 w-4' />
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className='text-text-muted p-1 hover:text-red-500'
                          title='삭제'
                          disabled={saving}
                        >
                          <Trash2 className='h-4 w-4' />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
