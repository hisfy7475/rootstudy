'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Mail, Phone, Shield, User, UserPlus, X } from 'lucide-react';
import { createAdmin } from '@/lib/actions/admin';

interface Branch {
  id: string;
  name: string;
}

interface AddAdminModalProps {
  branches: Branch[];
  onClose: () => void;
  onSuccess: () => void;
}

export function AddAdminModal({ branches, onClose, onSuccess }: AddAdminModalProps) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    branchId: '',
    isSuperAdmin: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.email || !form.password || !form.name) {
      setError('이메일, 비밀번호, 이름은 필수입니다.');
      return;
    }

    if (form.password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await createAdmin({
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone || undefined,
        branchId: form.branchId || undefined,
        isSuperAdmin: form.isSuperAdmin,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || '관리자 추가에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to create admin:', err);
      setError('관리자 추가 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='w-full max-w-md space-y-5 p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-lg font-semibold'>
            <Shield className='h-5 w-5 text-purple-600' />
            관리자 추가
          </h2>
          <button onClick={onClose} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-4'>
          <div>
            <label className='mb-1.5 block text-sm font-medium'>
              이메일 <span className='text-red-500'>*</span>
            </label>
            <div className='relative'>
              <Mail className='text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                type='email'
                placeholder='admin@example.com'
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className='pl-10'
              />
            </div>
          </div>

          <div>
            <label className='mb-1.5 block text-sm font-medium'>
              비밀번호 <span className='text-red-500'>*</span>
            </label>
            <div className='relative'>
              <Lock className='text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                type='password'
                placeholder='최소 6자 이상'
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className='pl-10'
              />
            </div>
          </div>

          <div>
            <label className='mb-1.5 block text-sm font-medium'>
              이름 <span className='text-red-500'>*</span>
            </label>
            <div className='relative'>
              <User className='text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                type='text'
                placeholder='관리자 이름'
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className='pl-10'
              />
            </div>
          </div>

          <div>
            <label className='mb-1.5 block text-sm font-medium'>전화번호</label>
            <div className='relative'>
              <Phone className='text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                type='tel'
                placeholder='010-0000-0000'
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                className='pl-10'
              />
            </div>
          </div>

          <div>
            <label className='mb-1.5 block text-sm font-medium'>소속 지점</label>
            <select
              value={form.branchId}
              onChange={(e) => setForm((prev) => ({ ...prev, branchId: e.target.value }))}
              disabled={form.isSuperAdmin}
              className='focus:ring-primary/50 h-10 w-full rounded-lg border px-3 text-sm focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'
            >
              <option value=''>지점 선택 (선택사항)</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            {form.isSuperAdmin && (
              <p className='mt-1 text-xs text-purple-600'>
                최고 관리자는 전 지점 권한이므로 지점을 지정하지 않습니다.
              </p>
            )}
          </div>

          <label className='flex cursor-pointer items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3'>
            <input
              type='checkbox'
              checked={form.isSuperAdmin}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  isSuperAdmin: e.target.checked,
                  // 슈퍼 체크 시 지점 입력값 자동 비우기 (모순 입력 방지)
                  branchId: e.target.checked ? '' : prev.branchId,
                }))
              }
              className='mt-0.5 h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500'
            />
            <div>
              <div className='text-sm font-medium text-purple-700'>최고 관리자로 지정</div>
              <p className='mt-0.5 text-xs text-purple-600'>
                전 지점 데이터 조회·수정·삭제, 다른 어드민 계정 관리 권한이 부여됩니다.
              </p>
            </div>
          </label>
        </div>

        {error && (
          <div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600'>
            {error}
          </div>
        )}

        <div className='flex gap-3 pt-2'>
          <Button variant='outline' className='flex-1' onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button className='flex-1' onClick={handleSubmit} disabled={loading}>
            <UserPlus className='mr-1 h-4 w-4' />
            {loading ? '추가중...' : '관리자 추가'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
