'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';
import { formatYmdShort } from '@/lib/utils';

interface MenuConflictModalProps {
  date: string;
  conflicts: Array<{ product_id: string; product_name: string }>;
  onCancel: () => void;
  onConfirm: () => void;
}

export function MenuConflictModal({
  date,
  conflicts,
  onCancel,
  onConfirm,
}: MenuConflictModalProps) {
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
      <Card className='w-full max-w-md space-y-5 p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='flex items-center gap-2 text-lg font-semibold text-amber-600'>
            <AlertTriangle className='h-5 w-5' />
            메뉴 중복 확인
          </h2>
          <button onClick={onCancel} className='text-text-muted hover:text-text'>
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4'>
          <p className='text-sm text-amber-800'>
            <strong>{formatYmdShort(date)}</strong> 에 같은 끼니로 메뉴가 등록된 다른 상품이
            있습니다.
          </p>
          <ul className='list-inside list-disc space-y-1 text-sm text-amber-900'>
            {conflicts.map((c) => (
              <li key={c.product_id}>{c.product_name}</li>
            ))}
          </ul>
          <p className='text-sm text-amber-800'>같은 날에 두 상품을 동시에 운영하시는 게 맞나요?</p>
        </div>

        <div className='flex gap-3 pt-2'>
          <Button variant='outline' className='flex-1' onClick={onCancel}>
            취소
          </Button>
          <Button className='flex-1' onClick={onConfirm}>
            그대로 저장
          </Button>
        </div>
      </Card>
    </div>
  );
}
