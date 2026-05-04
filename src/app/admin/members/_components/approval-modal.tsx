'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, User, X } from 'lucide-react';
import { approveStudent, getStudentDetail } from '@/lib/actions/admin';
import { getStudentTypes } from '@/lib/actions/student-type';

interface StudentTypeOption {
  id: string;
  name: string;
}

interface ApprovalModalProps {
  student: { id: string; name: string; email: string; phone: string | null };
  onClose: () => void;
  onSuccess: () => void;
}

export function ApprovalModal({ student, onClose, onSuccess }: ApprovalModalProps) {
  const [form, setForm] = useState({ capsId: '', seatNumber: '', studentTypeId: '' });
  const [studentTypes, setStudentTypes] = useState<StudentTypeOption[]>([]);
  const [loading, setLoading] = useState(false);

  // 모달 마운트 시 학생 상세 + 학생 타입 목록 병렬 로드, 폼 프리필
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [detail, types] = await Promise.all([
          getStudentDetail(student.id),
          getStudentTypes(),
        ]);
        if (cancelled) return;
        setStudentTypes(types.map((t) => ({ id: t.id, name: t.name })));
        if (detail) {
          setForm({
            capsId: detail.capsId || '',
            seatNumber: detail.seatNumber ? String(detail.seatNumber) : '',
            studentTypeId: detail.studentTypeId || '',
          });
        }
      } catch (error) {
        console.error('Failed to load approval data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student.id]);

  const handleApprove = async () => {
    setLoading(true);
    try {
      const result = await approveStudent(
        student.id,
        form.capsId,
        form.seatNumber ? parseInt(form.seatNumber) : null,
        form.studentTypeId || null,
      );

      if (result.success) {
        onSuccess();
      } else {
        alert(result.error || '승인에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to approve student:', error);
      alert('승인 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='w-full max-w-md space-y-5 p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='text-lg font-semibold'>학생 가입 승인</h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-3 rounded-xl bg-gray-50 p-4'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100'>
              <User className='h-5 w-5 text-yellow-600' />
            </div>
            <div>
              <p className='font-medium'>{student.name}</p>
              <p className='text-text-muted text-sm'>{student.email}</p>
            </div>
          </div>
          <div className='flex items-center gap-2 pl-[52px] text-sm'>
            <Phone className='text-text-muted h-3.5 w-3.5' />
            <span>{student.phone || '-'}</span>
          </div>
        </div>

        <div className='space-y-4'>
          <div>
            <label className='mb-1.5 block text-sm font-medium'>
              CAPS ID <span className='text-text-muted font-normal'>(출입관리 학번)</span>
            </label>
            <Input
              type='text'
              placeholder='CAPS ID 입력'
              value={form.capsId}
              onChange={(e) => setForm((prev) => ({ ...prev, capsId: e.target.value }))}
            />
          </div>

          <div>
            <label className='mb-1.5 block text-sm font-medium'>좌석 번호</label>
            <Input
              type='number'
              placeholder='좌석 번호 입력'
              value={form.seatNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, seatNumber: e.target.value }))}
            />
          </div>

          <div>
            <label className='mb-1.5 block text-sm font-medium'>학생 타입</label>
            <select
              value={form.studentTypeId}
              onChange={(e) => setForm((prev) => ({ ...prev, studentTypeId: e.target.value }))}
              className='focus:ring-primary/50 h-10 w-full rounded-lg border px-3 text-sm focus:ring-2 focus:outline-none'
            >
              <option value=''>학생 타입 선택</option>
              {studentTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className='flex gap-3 pt-2'>
          <Button variant='outline' className='flex-1' onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button
            className='flex-1 bg-green-600 text-white hover:bg-green-700'
            onClick={handleApprove}
            disabled={loading}
          >
            {loading ? '처리중...' : '승인'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
