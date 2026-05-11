'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { copyText } from '@/lib/clipboard';
import Image from 'next/image';
import { Copy, FileText, X } from 'lucide-react';

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

export function ChatMessageItem({
  content,
  imageUrl,
  fileUrl,
  fileName,
  fileType,
  senderName,
  senderType,
  createdAt,
  isOwn,
}: ChatMessageItemProps) {
  const [showFullImage, setShowFullImage] = useState(false);
  const [copiedHint, setCopiedHint] = useState(false);
  const timeString = new Date(createdAt).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const typeLabel = senderTypeLabels[senderType] || senderType;
  const typeColor = senderTypeColors[senderType] || 'text-gray-500';

  // 명시적 복사 버튼: user gesture 컨텍스트에서 직접 호출되어
  // iOS WKWebView 의 user activation 제약을 피한다 (이전엔 setTimeout 콜백
  // 안에서 navigator.clipboard 를 호출해 활성화 토큰이 사라졌다).
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

  const hasText = !!content;

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

        {/* 메시지 버블 + 시간 + 복사 버튼 */}
        <div className={cn('flex items-end gap-2', isOwn && 'flex-row-reverse')}>
          <div
            className={cn(
              'overflow-hidden rounded-2xl',
              isOwn ? 'bg-primary rounded-br-md text-white' : 'text-text rounded-bl-md bg-gray-100',
              imageUrl || (fileUrl && fileType === 'file') ? 'p-1' : 'px-4 py-2.5',
            )}
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
          {/* 텍스트가 있을 때만 복사 버튼 노출. 데스크톱: hover 시 fade-in,
              모바일: 항상 옅게 표시(터치 hover 가 일관되지 않음). */}
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
          <span className='text-text-muted flex-shrink-0 text-xs'>{timeString}</span>
        </div>
      </div>

      {/* 이미지 전체보기 모달 */}
      {showFullImage && imageUrl && (
        <div
          className='fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4'
          onClick={() => setShowFullImage(false)}
        >
          <button
            onClick={() => setShowFullImage(false)}
            className='absolute top-12 right-4 z-[10000] rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30'
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
        </div>
      )}
    </>
  );
}
