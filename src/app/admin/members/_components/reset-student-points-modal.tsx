'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcw, X } from 'lucide-react';
import { resetStudentPointsForReenroll } from '@/lib/actions/admin';

interface ResetStudentPointsModalProps {
  student: {
    id: string;
    name: string;
    email: string;
    school: string | null;
    branchName: string | null;
  };
  onClose: () => void;
  onSuccess: (result: { rewardCleared: number; penaltyCleared: number }) => void;
}

// 퇴원 후 재입반 학생의 상벌점 초기화.
// 되돌릴 수 없는 작업이라 회원 복구와 같은 방식으로 이름을 다시 입력받는다.
export function ResetStudentPointsModal({
  student,
  onClose,
  onSuccess,
}: ResetStudentPointsModalProps) {
  const [confirmName, setConfirmName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = confirmName.trim() === student.name.trim();

  const handleSubmit = async () => {
    if (!nameMatches) return setError('학생 이름이 일치하지 않습니다.');

    setLoading(true);
    setError(null);
    try {
      const res = await resetStudentPointsForReenroll(student.id);
      if ('success' in res && res.success) {
        onSuccess({ rewardCleared: res.rewardCleared, penaltyCleared: res.penaltyCleared });
      } else {
        setError(('error' in res && res.error) || '상벌점 초기화에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to reset student points:', err);
      setError('상벌점 초기화 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='max-h-[90vh] w-full max-w-md space-y-5 overflow-y-auto p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-lg font-semibold'>
            <RotateCcw className='h-5 w-5 text-blue-600' />
            상벌점 초기화 (재입반)
          </h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-1 rounded-xl border border-blue-200 bg-blue-50 p-4'>
          <p className='text-sm font-medium text-blue-800'>{student.name}</p>
          <p className='text-xs break-all text-blue-700'>로그인 아이디: {student.email}</p>
          <p className='text-xs text-blue-700'>
            {[student.school, student.branchName].filter(Boolean).join(' · ') || '-'}
          </p>
        </div>

        <ul className='text-text-muted list-disc space-y-1 pl-5 text-sm leading-relaxed'>
          <li>
            퇴원 후 다시 입반한 학생의 <strong className='text-text'>상점·벌점을 0점으로</strong>{' '}
            되돌립니다.
          </li>
          <li>과거 내역은 지워지지 않고 상벌점 기록에 &lsquo;초기화&rsquo;로 남습니다.</li>
          <li>퇴원 검토·강제 퇴원 분류와 대기 중인 상품권 자동 발급도 함께 해제됩니다.</li>
          <li>초기화 이전 내역은 이후 취소·삭제할 수 없으며, 초기화는 되돌릴 수 없습니다.</li>
        </ul>

        <div className='space-y-1'>
          <label className='text-sm font-medium'>확인을 위해 학생 이름을 입력해 주세요.</label>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={student.name}
          />
        </div>

        {error && <p className='text-sm text-red-600'>{error}</p>}

        <div className='flex justify-end gap-2'>
          <Button variant='outline' onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !nameMatches}>
            {loading ? '처리 중...' : '초기화'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
