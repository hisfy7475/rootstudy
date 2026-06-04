'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { MealImage } from '@/components/shared/meal-image';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MealProduct, MealProductVariant } from '@/types/database';
import { deleteMealProduct, type MealProductsListResult } from '@/lib/actions/meal';

const statusLabel: Record<MealProduct['status'], string> = {
  active: '판매중',
  inactive: '비활성',
  sold_out: '마감',
};

interface AdminMealsClientProps {
  initialResult: MealProductsListResult;
}

function priceRangeLabel(variants: MealProductVariant[]): string {
  if (variants.length === 0) return '-';
  const prices = variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `${min.toLocaleString()}원`;
  return `${min.toLocaleString()} ~ ${max.toLocaleString()}원`;
}

function variantSummary(variants: MealProductVariant[]): string {
  if (variants.length === 0) return '옵션 없음';
  const oneTime = variants.filter((v) => v.kind === 'one_time').length;
  const recurring = variants.filter((v) => v.kind === 'recurring').length;
  const parts: string[] = [];
  if (oneTime) parts.push(`일일 ${oneTime}`);
  if (recurring) parts.push(`정기 ${recurring}`);
  return parts.join(', ');
}

export function AdminMealsClient({ initialResult }: AdminMealsClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const products = initialResult.rows;
  const total = initialResult.total;
  const page = initialResult.page;
  const pageSize = initialResult.pageSize;

  const handleDelete = async (
    e: React.MouseEvent<HTMLButtonElement>,
    product: { id: string; name: string },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (deletingId) return;
    const ok = window.confirm(
      `"${product.name}" 상품을 영구 삭제하시겠습니까?\n신청 이력이 있으면 삭제할 수 없습니다.`,
    );
    if (!ok) return;
    setDeletingId(product.id);
    const res = await deleteMealProduct(product.id);
    setDeletingId(null);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className='space-y-6 p-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>급식 관리 ({total}건)</h1>
          <p className='text-muted-foreground mt-1 text-sm'>상품 등록·옵션·메뉴·신청 현황</p>
        </div>
        <Link
          href='/admin/meals/new'
          className={cn(
            'inline-flex items-center justify-center gap-0 rounded-2xl font-medium transition-all duration-200',
            'bg-primary hover:bg-primary/90 text-white shadow-sm hover:shadow-md',
            'focus:ring-primary px-5 py-2.5 text-base focus:ring-2 focus:ring-offset-2 focus:outline-none',
          )}
        >
          <Plus className='mr-2 size-4' />
          상품 등록
        </Link>
      </div>

      <DataTableToolbar
        searchPlaceholder='상품명 검색...'
        filters={[
          {
            key: 'status',
            label: '상태',
            options: [
              { value: 'active', label: '판매중' },
              { value: 'inactive', label: '비활성' },
              { value: 'sold_out', label: '마감' },
            ],
          },
        ]}
      />

      <Card className='overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b text-left'>
              <tr>
                <th className='w-16 p-3 font-medium'></th>
                <th className='p-3 font-medium'>이름</th>
                <th className='p-3 font-medium'>유형</th>
                <th className='p-3 font-medium'>옵션</th>
                <th className='p-3 font-medium'>가격</th>
                <th className='p-3 font-medium'>상태</th>
                <th className='w-16 p-3 text-right font-medium'></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className='text-muted-foreground p-8 text-center'>
                    등록된 상품이 없습니다.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className='hover:bg-muted/30 border-b last:border-0'>
                    <td className='p-3'>
                      <div className='h-10 w-10 overflow-hidden rounded-md'>
                        <MealImage
                          src={p.image_url}
                          type='product'
                          alt={p.name}
                          width={40}
                          height={40}
                          className='h-10 w-10 rounded-md'
                        />
                      </div>
                    </td>
                    <td className='p-3'>
                      <Link
                        href={`/admin/meals/${p.id}`}
                        className='text-primary font-medium hover:underline'
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className='p-3'>{p.meal_type === 'lunch' ? '중식' : '석식'}</td>
                    <td className='p-3 whitespace-nowrap'>{variantSummary(p.variants)}</td>
                    <td className='p-3 whitespace-nowrap'>{priceRangeLabel(p.variants)}</td>
                    <td className='p-3'>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          p.status === 'active' && 'bg-emerald-100 text-emerald-800',
                          p.status === 'inactive' && 'bg-slate-100 text-slate-700',
                          p.status === 'sold_out' && 'bg-amber-100 text-amber-900',
                        )}
                      >
                        {statusLabel[p.status]}
                      </span>
                    </td>
                    <td className='p-3 text-right'>
                      <button
                        type='button'
                        onClick={(e) => handleDelete(e, p)}
                        disabled={deletingId === p.id}
                        title='상품 삭제'
                        aria-label={`${p.name} 상품 삭제`}
                        className={cn(
                          'inline-flex items-center justify-center rounded-md p-2 transition-colors',
                          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                      >
                        <Trash2 className='size-4' />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className='flex justify-center'>
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          pathname={pathname}
          searchParams={new URLSearchParams(sp.toString())}
        />
      </div>
    </div>
  );
}
