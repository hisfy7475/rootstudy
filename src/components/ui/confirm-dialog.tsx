'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 본문 보조 설명(선택). 줄바꿈(\n) 지원. */
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 확인 버튼을 위험(빨강) 스타일로 표시 */
  danger?: boolean;
  /** 처리 중이면 버튼 비활성화 */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 서비스 UI(Card/Button)에 맞춘 확인 모달.
 * window.confirm 대신 사용해 스타일/접근성을 통일한다.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '확인',
  cancelText = '취소',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4'
      role='dialog'
      aria-modal='true'
      onClick={onCancel}
    >
      <Card className='w-full max-w-sm space-y-4 p-5' onClick={(e) => e.stopPropagation()}>
        <h2 className='text-text text-base font-semibold'>{title}</h2>
        {description ? (
          <p className='text-text-muted text-sm whitespace-pre-line'>{description}</p>
        ) : null}
        <div className='flex justify-end gap-2'>
          <Button variant='outline' size='sm' onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size='sm'
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmText}
          </Button>
        </div>
      </Card>
    </div>
  );
}
