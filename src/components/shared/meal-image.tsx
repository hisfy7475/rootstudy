'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

const PRODUCT_PLACEHOLDER = '/images/meal-product-placeholder.png';
const MENU_PLACEHOLDER = '/images/meal-menu-placeholder.png';

interface MealImageProps {
  src: string | null | undefined;
  type: 'product' | 'menu';
  alt?: string;
  className?: string;
  /** fixed width (px) — passed to next/image */
  width?: number;
  /** fixed height (px) — passed to next/image */
  height?: number;
  /** use fill layout instead of fixed size */
  fill?: boolean;
  priority?: boolean;
}

export function MealImage({
  src,
  type,
  alt = '',
  className,
  width = 400,
  height = 300,
  fill,
  priority = false,
}: MealImageProps) {
  const placeholder = type === 'product' ? PRODUCT_PLACEHOLDER : MENU_PLACEHOLDER;
  const imgSrc = src || placeholder;
  const isExternal = imgSrc.startsWith('http');

  if (fill) {
    return (
      <Image
        src={imgSrc}
        alt={alt}
        fill
        className={cn('object-cover', className)}
        sizes="(max-width: 768px) 100vw, 400px"
        priority={priority}
        unoptimized={isExternal}
      />
    );
  }

  return (
    <Image
      src={imgSrc}
      alt={alt}
      width={width}
      height={height}
      className={cn('object-cover', className)}
      priority={priority}
      unoptimized={isExternal}
    />
  );
}
