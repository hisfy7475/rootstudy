import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * 모바일 카드 리스트 — 데스크톱 `<table>`을 `md:hidden`으로 대체하는 카드 목록 컨테이너.
 *
 * 사용 패턴(앱 전역의 `hidden md:block` / `md:hidden` 이중 렌더 컨벤션):
 *   <Card className='hidden overflow-hidden md:block'>…데스크톱 표…</Card>
 *   <DataCardList>
 *     {rows.map((r) => (
 *       <DataCard key={r.id}>
 *         <DataCardHeader title={r.name} meta={r.subtitle} right={<button…/>} />
 *         <DataCardRow label='상태'><StatusBadge …/></DataCardRow>
 *       </DataCard>
 *     ))}
 *   </DataCardList>
 *
 * 값 슬롯에는 badge/select/input 등 기존 커스텀 노드를 그대로 넣어 상태·핸들러를 재사용한다.
 */
export function DataCardList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn('divide-y divide-gray-100 rounded-2xl border border-gray-100 md:hidden', className)}
    >
      {children}
    </div>
  );
}

/** 카드 한 장 = 표의 한 행. */
export function DataCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('space-y-2 p-4', className)}>{children}</div>;
}

/** 카드 상단: 제목 + (선택) 부가정보 + 우측 상태/액션 슬롯. */
export function DataCardHeader({
  title,
  meta,
  right,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <div className='min-w-0 flex-1'>
        <div className='truncate font-semibold'>{title}</div>
        {meta != null && meta !== false && (
          <div className='text-text-muted mt-0.5 truncate text-sm'>{meta}</div>
        )}
      </div>
      {right != null && right !== false && (
        <div className='flex flex-shrink-0 items-center gap-1'>{right}</div>
      )}
    </div>
  );
}

/** 라벨-값 한 줄. 값 슬롯에 badge/select/input 등 커스텀 노드를 그대로 넣는다. */
export function DataCardRow({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-sm', className)}>
      <span className='text-text-muted flex-shrink-0'>{label}</span>
      <span className='min-w-0 text-right'>{children}</span>
    </div>
  );
}
