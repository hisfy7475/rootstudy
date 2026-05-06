'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRODUCT_PLACEHOLDER = '/images/meal-product-placeholder.png';
const MENU_PLACEHOLDER = '/images/meal-menu-placeholder.png';

interface ImageLightboxProps {
  open: boolean;
  src: string | null | undefined;
  alt?: string;
  onClose: () => void;
  fallbackType?: 'product' | 'menu';
  className?: string;
}

export function ImageLightbox({
  open,
  src,
  alt = '',
  onClose,
  fallbackType = 'product',
  className,
}: ImageLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const placeholder = fallbackType === 'menu' ? MENU_PLACEHOLDER : PRODUCT_PLACEHOLDER;
  const imgSrc = src && src.length > 0 ? src : placeholder;

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={alt || '이미지 확대'}
      className={cn(
        'fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4',
        className,
      )}
      onClick={onClose}
    >
      <button
        type='button'
        aria-label='닫기'
        onClick={onClose}
        className='absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none'
      >
        <X className='h-5 w-5' />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className='max-h-[90vh] max-w-[95vw] object-contain select-none'
        draggable={false}
      />
    </div>
  );
}
