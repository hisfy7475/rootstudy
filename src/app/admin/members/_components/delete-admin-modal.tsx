'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Building2, Shield, Trash2, X } from 'lucide-react';
import { deleteAdmin } from '@/lib/actions/admin';

interface DeleteAdminModalProps {
  admin: { id: string; name: string; email: string; branch_name: string | null };
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteAdminModal({ admin, onClose, onSuccess }: DeleteAdminModalProps) {
  const [confirmName, setConfirmName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirmName !== admin.name) {
      alert('관리자 이름이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const result = await deleteAdmin(admin.id);

      if (result.success) {
        if (result.warning) {
          alert(result.warning);
        }
        onSuccess();
      } else {
        alert(result.error || '관리자 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete admin:', error);
      alert('관리자 삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='w-full max-w-md space-y-5 p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-lg font-semibold text-red-600'>
            <AlertTriangle className='h-5 w-5' />
            관리자 삭제
          </h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-2 rounded-xl border border-red-200 bg-red-50 p-4'>
          <p className='font-medium text-red-700'>이 작업은 되돌릴 수 없습니다.</p>
          <p className='text-sm text-red-600'>
            <strong>[{admin.name}]</strong> 관리자를 삭제하시겠습니까?
          </p>
        </div>

        <div className='space-y-2 rounded-xl bg-gray-50 p-4'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-full bg-purple-100'>
              <Shield className='h-5 w-5 text-purple-600' />
            </div>
            <div>
              <p className='font-medium'>{admin.name}</p>
              <p className='text-text-muted text-sm'>{admin.email}</p>
            </div>
          </div>
          {admin.branch_name && (
            <div className='flex items-center gap-2 pl-[52px] text-sm'>
              <Building2 className='text-text-muted h-3.5 w-3.5' />
              <span>{admin.branch_name}</span>
            </div>
          )}
        </div>

        <div>
          <label className='mb-1.5 block text-sm font-medium'>
            확인을 위해 관리자 이름을 입력하세요
          </label>
          <Input
            type='text'
            placeholder={admin.name}
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
            disabled={loading || confirmName !== admin.name}
          >
            <Trash2 className='mr-1 h-4 w-4' />
            {loading ? '처리중...' : '삭제'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
