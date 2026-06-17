'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { copyText } from '@/lib/clipboard';
import Image from 'next/image';
import { Copy, FileText, MoreVertical, Trash2, X } from 'lucide-react';
import { useLongPress } from '@/lib/hooks/use-long-press';

interface ChatMessageItemProps {
  id: string;
  content: string;
  imageUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  senderName: string;
  senderType: 'student' | 'parent' | 'admin' | string;
  createdAt: string;
  isOwn: boolean;
  deletedAt?: string | null;
  onDelete?: (id: string) => void;
}

const senderTypeLabels: Record<string, string> = {
  student: '학생',
  parent: '학부모',
  admin: '관리자',
};

const senderTypeColors: Record<string, string> = {
  student: 'text-primary',
  parent: 'text-secondary',
  admin: 'text-accent',
};

const DELETE_WINDOW_MS = 5 * 60 * 1000;

export function ChatMessageItem({
  id,
  content,
  imageUrl,
  fileUrl,
  fileName,
  fileType,
  senderName,
  senderType,
  createdAt,
  isOwn,
  deletedAt,
  onDelete,
}: ChatMessageItemProps) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [copiedHint, setCopiedHint] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // lazy initializer로 mount 시점에 한 번만 Date.now() 호출 (렌더 중 impure call 회피)
  const [now, setNow] = useState<number>(() => Date.now());
  const menuRef = useRef<HTMLDivElement>(null);

  const timeString = new Date(createdAt).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const typeLabel = senderTypeLabels[senderType] || senderType;
  const typeColor = senderTypeColors[senderType] || 'text-gray-500';

  const createdMs = new Date(createdAt).getTime();
  const ageMs = now - createdMs;
  const canDelete = isOwn && !!onDelete && !deletedAt && ageMs < DELETE_WINDOW_MS;

  // 5분 만료 자동 갱신: 윈도우 종료 시점에 now 를 갱신해 ⋮ 자동 숨김.
  useEffect(() => {
    if (!isOwn || deletedAt) return;
    const remaining = DELETE_WINDOW_MS - (Date.now() - createdMs);
    if (remaining <= 0 || remaining > DELETE_WINDOW_MS) return;
    const t = setTimeout(() => setNow(Date.now()), remaining + 100);
    return () => clearTimeout(t);
  }, [isOwn, deletedAt, createdMs]);

  // 메뉴 외부 클릭/ESC 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  // 이미지 전체보기 모달: ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!showFullImage) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFullImage(false);
    };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showFullImage]);

  const handleCopy = useCallback(async () => {
    const text = content.trim();
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setCopiedHint(true);
      window.setTimeout(() => setCopiedHint(false), 2000);
    } else {
      window.alert('복사에 실패했습니다.');
    }
  }, [content]);

  const openMenu = useCallback(() => {
    if (!canDelete) return;
    setMenuOpen(true);
  }, [canDelete]);

  const longPressHandlers = useLongPress({ onLongPress: openMenu });

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    if (!onDelete) return;
    if (!window.confirm('이 메시지를 삭제하시겠습니까?')) return;
    onDelete(id);
  }, [id, onDelete]);

  const hasText = !!content;

  // 삭제된 메시지: 자리 표시자 (대화 맥락은 유지)
  if (deletedAt) {
    return (
      <div
        className={cn(
          'flex max-w-[80%] flex-col gap-1',
          isOwn ? 'ml-auto items-end' : 'mr-auto items-start',
        )}
      >
        {!isOwn && (
          <div className='flex items-center gap-1.5 px-1'>
            <span className='text-text text-xs font-medium'>{senderName}</span>
            <span className={cn('text-xs', typeColor)}>({typeLabel})</span>
          </div>
        )}
        <div className={cn('flex items-end gap-2', isOwn && 'flex-row-reverse')}>
          <div className='text-text-muted rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm italic'>
            삭제된 메시지입니다
          </div>
          <span className='text-text-muted flex-shrink-0 text-xs'>{timeString}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'group relative flex max-w-[80%] flex-col gap-1',
          isOwn ? 'ml-auto items-end' : 'mr-auto items-start',
        )}
      >
        {copiedHint && (
          <div
            className={cn(
              'absolute -top-9 z-10 rounded-lg bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow-md',
              isOwn ? 'right-0' : 'left-0',
            )}
            role='status'
          >
            복사되었습니다
          </div>
        )}
        {/* 발신자 정보 (본인 메시지가 아닐 때만) */}
        {!isOwn && (
          <div className='flex items-center gap-1.5 px-1'>
            <span className='text-text text-xs font-medium'>{senderName}</span>
            <span className={cn('text-xs', typeColor)}>({typeLabel})</span>
          </div>
        )}

        {/* 메시지 버블 + 시간 + 복사/메뉴 버튼 */}
        <div className={cn('flex items-end gap-2', isOwn && 'flex-row-reverse')}>
          <div
            className={cn(
              'overflow-hidden rounded-2xl',
              isOwn ? 'bg-primary rounded-br-md text-white' : 'text-text rounded-bl-md bg-gray-100',
              imageUrl || (fileUrl && fileType === 'file') ? 'p-1' : 'px-4 py-2.5',
            )}
            onTouchStart={canDelete ? longPressHandlers.onTouchStart : undefined}
            onTouchMove={canDelete ? longPressHandlers.onTouchMove : undefined}
            onTouchEnd={canDelete ? longPressHandlers.onTouchEnd : undefined}
            onTouchCancel={canDelete ? longPressHandlers.onTouchCancel : undefined}
          >
            {/* 일반 파일 첨부 */}
            {fileUrl && fileType === 'file' && (
              <a
                href={fileUrl}
                download={fileName ?? undefined}
                target='_blank'
                rel='noopener noreferrer'
                className={cn(
                  'mb-1 flex max-w-[280px] min-w-[200px] items-center gap-2 rounded-xl px-3 py-2.5',
                  isOwn
                    ? 'bg-white/15 text-white hover:bg-white/25'
                    : 'text-text border border-gray-200 bg-white hover:bg-gray-50',
                )}
              >
                <FileText className='h-8 w-8 flex-shrink-0 opacity-90' />
                <span className='line-clamp-3 text-sm font-medium break-all'>
                  {fileName || '첨부파일'}
                </span>
              </a>
            )}
            {/* 이미지 */}
            {imageUrl && (
              <div className='relative mb-1 cursor-pointer' onClick={() => setShowFullImage(true)}>
                <Image
                  src={imageUrl}
                  alt='채팅 이미지'
                  width={200}
                  height={200}
                  unoptimized
                  className='max-h-[200px] max-w-[200px] rounded-xl object-cover'
                  style={{ width: 'auto', height: 'auto' }}
                />
              </div>
            )}
            {/* 텍스트 내용 — select-text 유지하여 데스크톱 드래그 선택과
                모바일 OS 기본 long-press 텍스트 선택 메뉴를 보존한다. */}
            {hasText && (
              <div
                className={cn(
                  'break-words whitespace-pre-wrap select-text',
                  (imageUrl || (fileUrl && fileType === 'file')) && 'px-3 py-2',
                )}
              >
                {content}
              </div>
            )}
          </div>

          {/* 액션 영역: 복사/⋮/시간을 묶어 텍스트 없는 케이스에서도 정렬 보존 */}
          <div className='flex items-center gap-1'>
            {hasText && (
              <button
                type='button'
                onClick={handleCopy}
                aria-label='메시지 복사'
                className={cn(
                  'text-text-muted flex-shrink-0 rounded-full p-1.5',
                  'transition-opacity duration-150',
                  'opacity-40 hover:bg-gray-100 hover:opacity-100',
                  'md:opacity-0 md:group-hover:opacity-100',
                )}
              >
                <Copy className='h-3.5 w-3.5' />
              </button>
            )}
            {canDelete && (
              <div className='relative' ref={menuRef}>
                <button
                  type='button'
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label='메시지 더보기'
                  aria-haspopup='menu'
                  aria-expanded={menuOpen}
                  className={cn(
                    'text-text-muted flex-shrink-0 rounded-full p-1.5',
                    'transition-opacity duration-150',
                    'opacity-40 hover:bg-gray-100 hover:opacity-100',
                    'md:opacity-0 md:group-hover:opacity-100',
                  )}
                >
                  <MoreVertical className='h-3.5 w-3.5' />
                </button>
                {menuOpen && (
                  <div
                    role='menu'
                    className={cn(
                      'absolute z-20 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg',
                      isOwn ? 'right-0' : 'left-0',
                    )}
                  >
                    <button
                      type='button'
                      role='menuitem'
                      onClick={handleDelete}
                      className='flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50'
                    >
                      <Trash2 className='h-4 w-4' />
                      메시지 삭제
                    </button>
                  </div>
                )}
              </div>
            )}
            <span className='text-text-muted flex-shrink-0 text-xs'>{timeString}</span>
          </div>
        </div>
      </div>

      {/* 이미지 전체보기 모달 — 상위 stacking context(헤더/네비바 transform·backdrop)를
          탈출하도록 document.body 로 portal 한다. */}
      {showFullImage &&
        imageUrl &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className='pt-safe pb-safe fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4'
            onClick={() => setShowFullImage(false)}
          >
            <button
              onClick={() => setShowFullImage(false)}
              aria-label='닫기'
              className='absolute top-[max(1rem,var(--app-safe-top))] right-4 z-[10000] rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30'
            >
              <X className='h-6 w-6 text-white' />
            </button>
            <Image
              src={imageUrl}
              alt='채팅 이미지 전체보기'
              width={800}
              height={800}
              unoptimized
              className='max-h-full max-w-full rounded-lg object-contain'
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
