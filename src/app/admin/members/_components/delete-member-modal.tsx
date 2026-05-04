'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Trash2, User, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { deleteMember } from '@/lib/actions/admin';

interface DeleteMemberModalProps {
  member: { id: string; name: string; email: string };
  userType: 'student' | 'parent';
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteMemberModal({
  member,
  userType,
  onClose,
  onSuccess,
}: DeleteMemberModalProps) {
  const [confirmName, setConfirmName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirmName.trim() !== member.name.trim()) {
      alert('회원 이름이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const result = await deleteMember(member.id, userType);

      if (result.success) {
        if (result.warning) {
          alert(result.warning);
        }
        onSuccess();
      } else {
        alert(result.error || '탈퇴 처리에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete member:', error);
      alert('탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const isMatch = confirmName.trim() === member.name.trim();

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='w-full max-w-md space-y-5 p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-lg font-semibold text-red-600'>
            <AlertTriangle className='h-5 w-5' />
            회원 퇴원 처리
          </h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-2 rounded-xl border border-red-200 bg-red-50 p-4'>
          <p className='font-medium text-red-700'>
            <strong>[{member.name}]</strong> 회원을 퇴원 처리합니다.
          </p>
          {userType === 'student' ? (
            <p className='text-sm text-red-600'>
              학생 계정이 즉시 비활성화되어 로그인이 차단되며, 학생 목록·출결·좌석 등 활성 화면에서
              사라집니다. 모의고사 응시·결제·상담 등 과거 이력은 보존되어 통계에 그대로 반영됩니다.
            </p>
          ) : (
            <p className='text-sm text-red-600'>
              활성 자녀가 있으면 학부모 계정은 유지하고 <strong>자녀 연결만 모두 해제</strong>
              합니다(자녀 계정은 영향 없음). 활성 자녀가 0명일 때만 학부모 계정 자체가
              비활성화됩니다.
            </p>
          )}
          <p className='text-xs text-red-600'>필요 시 「퇴원 회원 보기」에서 복구할 수 있습니다.</p>
        </div>

        <div className='space-y-2 rounded-xl bg-gray-50 p-4'>
          <div className='flex items-center gap-3'>
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                userType === 'student' ? 'bg-primary/10' : 'bg-secondary/10',
              )}
            >
              {userType === 'student' ? (
                <User className='text-primary h-5 w-5' />
              ) : (
                <UserCheck className='text-secondary h-5 w-5' />
              )}
            </div>
            <div>
              <p className='font-medium'>{member.name}</p>
              <p className='text-text-muted text-sm'>{member.email}</p>
            </div>
          </div>
        </div>

        <div>
          <label className='mb-1.5 block text-sm font-medium'>
            확인을 위해 회원 이름을 입력하세요
          </label>
          <Input
            type='text'
            placeholder={member.name}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            className='border-red-200 focus:ring-red-500'
          />
        </div>

        <div className='flex gap-3 pt-2'>
          <Button variant='outline' className='flex-1' onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button
            className='flex-1 bg-red-600 text-white hover:bg-red-700'
            onClick={handleDelete}
            disabled={loading || !isMatch}
          >
            <Trash2 className='mr-1 h-4 w-4' />
            {loading ? '처리중...' : '퇴원 처리'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
