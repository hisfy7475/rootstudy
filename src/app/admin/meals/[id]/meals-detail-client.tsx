'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MealImageUploader } from '@/components/shared/meal-image-uploader';
import {
  updateMealProduct,
  deleteMealProductImage,
  createMealProductVariant,
  updateMealProductVariant,
  deleteMealProductVariant,
  deleteMealProduct,
  type VariantInput,
  type VariantKind,
  type MealProductWithVariants,
} from '@/lib/actions/meal';
import { uploadMealProductImage } from '@/lib/uploads/meal-client';
import type { MealProduct, MealProductVariant } from '@/types/database';
import { CalendarDays, ListOrdered, Loader2, Plus, Trash2 } from 'lucide-react';

interface AdminMealsDetailClientProps {
  product: MealProductWithVariants;
}

const STATUS_LABEL: Record<MealProduct['status'], string> = {
  active: '판매중',
  inactive: '비활성',
  sold_out: '마감',
};

function isoDayOfWeek(ymd: string): number | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return dow;
}

function emptyVariantForm(): VariantInput & { _editingId?: string } {
  return {
    kind: 'one_time',
    price: 0,
    sale_start_date: '',
    sale_end_date: '',
    product_start_date: '',
    product_end_date: '',
    max_capacity: null,
    status: 'active',
  };
}

function variantToForm(v: MealProductVariant): VariantInput & { _editingId: string } {
  return {
    _editingId: v.id,
    kind: v.kind,
    price: v.price,
    sale_start_date: v.sale_start_date,
    sale_end_date: v.sale_end_date,
    product_start_date: v.product_start_date,
    product_end_date: v.product_end_date,
    max_capacity: v.max_capacity,
    status: v.status,
  };
}

export function AdminMealsDetailClient({ product: initial }: AdminMealsDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [product, setProduct] = useState<MealProduct>(initial);
  const [variants, setVariants] = useState<MealProductVariant[]>(initial.variants);
  const [productLoading, setProductLoading] = useState(false);
  const [productMessage, setProductMessage] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    name: initial.name,
    meal_type: (initial.meal_type ?? 'lunch') as 'lunch' | 'dinner',
    description: initial.description ?? '',
    status: initial.status,
  });

  // 등록 직후 이미지 업로드 실패 안내 (?image_error=...). 한 번 보여주고 쿼리 정리.
  useEffect(() => {
    const imageErr = searchParams.get('image_error');
    if (imageErr) {
      setProductError(`이미지 업로드 실패: ${imageErr}`);
      router.replace(`/admin/meals/${initial.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [variantFormOpen, setVariantFormOpen] = useState(false);
  const [variantForm, setVariantForm] = useState(emptyVariantForm);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);

  const productDirty =
    productForm.name !== product.name ||
    productForm.meal_type !== (product.meal_type ?? 'lunch') ||
    productForm.description !== (product.description ?? '') ||
    productForm.status !== product.status;

  const submitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductError(null);
    setProductMessage(null);
    setProductLoading(true);
    const res = await updateMealProduct(product.id, {
      name: productForm.name,
      meal_type: productForm.meal_type,
      description: productForm.description.trim() || null,
      status: productForm.status,
    });
    setProductLoading(false);
    if (res.error) {
      setProductError(res.error);
      return;
    }
    if (res.data) {
      setProduct(res.data);
      setProductMessage('저장되었습니다.');
    }
  };

  const openAddVariant = () => {
    setVariantForm(emptyVariantForm());
    setVariantError(null);
    setVariantFormOpen(true);
  };

  const openEditVariant = (v: MealProductVariant) => {
    setVariantForm(variantToForm(v));
    setVariantError(null);
    setVariantFormOpen(true);
  };

  const cancelVariantForm = () => {
    setVariantFormOpen(false);
    setVariantError(null);
  };

  const submitVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    setVariantError(null);
    if (variantForm.price < 0) return setVariantError('가격을 입력하세요.');
    if (
      !variantForm.sale_start_date ||
      !variantForm.sale_end_date ||
      !variantForm.product_start_date ||
      !variantForm.product_end_date
    ) {
      return setVariantError('날짜를 모두 입력하세요.');
    }
    if (variantForm.kind === 'recurring') {
      if (isoDayOfWeek(variantForm.product_start_date) !== 1) {
        return setVariantError('정기 옵션은 월요일에 시작해야 합니다.');
      }
      if (isoDayOfWeek(variantForm.product_end_date) !== 5) {
        return setVariantError('정기 옵션은 금요일에 종료해야 합니다.');
      }
    }

    setVariantLoading(true);
    const editingId = (variantForm as VariantInput & { _editingId?: string })._editingId;
    const payload: VariantInput = {
      kind: variantForm.kind,
      price: variantForm.price,
      sale_start_date: variantForm.sale_start_date,
      sale_end_date: variantForm.sale_end_date,
      product_start_date: variantForm.product_start_date,
      product_end_date: variantForm.product_end_date,
      max_capacity: variantForm.max_capacity,
      status: variantForm.status,
    };

    const res = editingId
      ? await updateMealProductVariant(editingId, payload)
      : await createMealProductVariant(product.id, payload);

    setVariantLoading(false);
    if (res.error) {
      setVariantError(res.error);
      return;
    }
    if (res.data) {
      setVariants((prev) => {
        if (editingId) return prev.map((v) => (v.id === editingId ? res.data! : v));
        return [...prev, res.data!];
      });
      setVariantFormOpen(false);
    }
  };

  const removeVariant = async (v: MealProductVariant) => {
    if (!window.confirm('이 옵션을 삭제하시겠습니까?')) return;
    const res = await deleteMealProductVariant(v.id);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    setVariants((prev) => prev.filter((x) => x.id !== v.id));
  };

  const [productDeleting, setProductDeleting] = useState(false);
  const handleDeleteProduct = async () => {
    if (productDeleting) return;
    const ok = window.confirm(
      `"${product.name}" 상품을 영구 삭제하시겠습니까?\n신청 이력이 있으면 삭제할 수 없습니다.`,
    );
    if (!ok) return;
    setProductDeleting(true);
    const res = await deleteMealProduct(product.id);
    if (res.error) {
      setProductDeleting(false);
      window.alert(res.error);
      return;
    }
    router.push('/admin/meals');
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>상품 수정</h1>
          <p className='text-muted-foreground mt-1 text-sm'>{product.name}</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Link
            href={`/admin/meals/${product.id}/menus`}
            className='border-primary text-primary hover:bg-primary/10 focus:ring-primary inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-sm font-medium transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none'
          >
            <CalendarDays className='mr-2 size-4' />
            메뉴 입력
          </Link>
          <Link
            href={`/admin/meals/${product.id}/orders`}
            className='border-primary text-primary hover:bg-primary/10 focus:ring-primary inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-sm font-medium transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none'
          >
            <ListOrdered className='mr-2 size-4' />
            신청 현황
          </Link>
        </div>
      </div>

      <Card className='p-6'>
        <form onSubmit={submitProduct} className='space-y-4'>
          <h2 className='text-muted-foreground text-sm font-semibold'>상품 정보</h2>

          {productError && (
            <div className='bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'>
              {productError}
            </div>
          )}
          {productMessage && (
            <div className='rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900'>
              {productMessage}
            </div>
          )}

          <div>
            <label className='mb-1 block text-sm font-medium'>상품명</label>
            <Input
              value={productForm.name}
              onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className='mb-1 block text-sm font-medium'>식사 유형</label>
            <select
              className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
              value={productForm.meal_type}
              onChange={(e) =>
                setProductForm((f) => ({ ...f, meal_type: e.target.value as 'lunch' | 'dinner' }))
              }
            >
              <option value='lunch'>중식</option>
              <option value='dinner'>석식</option>
            </select>
          </div>

          <div>
            <label className='mb-1 block text-sm font-medium'>상태</label>
            <select
              className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
              value={productForm.status}
              onChange={(e) =>
                setProductForm((f) => ({ ...f, status: e.target.value as MealProduct['status'] }))
              }
            >
              <option value='active'>판매중</option>
              <option value='inactive'>비활성</option>
              <option value='sold_out'>마감</option>
            </select>
          </div>

          <div>
            <div className='mb-1 flex items-center gap-2'>
              <label className='block text-sm font-medium'>설명</label>
              <span className='text-muted-foreground text-xs'>
                · 우측 하단을 드래그하여 크기 조절 가능
              </span>
            </div>
            <textarea
              className='border-input bg-background min-h-[160px] w-full resize-y rounded-md border px-3 py-2 text-sm'
              value={productForm.description}
              onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <MealImageUploader
            currentUrl={product.image_url}
            onUpload={(fd) => uploadMealProductImage(product.id, fd)}
            onDelete={() => deleteMealProductImage(product.id)}
            placeholderSrc='/images/meal-product-placeholder.png'
          />

          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Button type='submit' disabled={productLoading || !productDirty}>
              {productLoading ? <Loader2 className='size-4 animate-spin' /> : '상품 정보 저장'}
            </Button>
            <Button
              type='button'
              variant='danger'
              disabled={productDeleting}
              onClick={handleDeleteProduct}
            >
              {productDeleting ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <>
                  <Trash2 className='mr-1 size-4' /> 상품 삭제
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      <Card className='space-y-4 p-6'>
        <div className='flex items-center justify-between'>
          <h2 className='text-muted-foreground text-sm font-semibold'>판매 옵션</h2>
          {!variantFormOpen && (
            <Button type='button' size='sm' onClick={openAddVariant}>
              <Plus className='mr-1 size-4' /> 옵션 추가
            </Button>
          )}
        </div>

        {variants.length === 0 && !variantFormOpen ? (
          <p className='text-muted-foreground text-sm'>등록된 옵션이 없습니다.</p>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 border-b text-left'>
                <tr>
                  <th className='p-2 font-medium'>종류</th>
                  <th className='p-2 font-medium'>가격</th>
                  <th className='p-2 font-medium'>판매기간</th>
                  <th className='p-2 font-medium'>식사기간</th>
                  <th className='p-2 font-medium'>정원</th>
                  <th className='p-2 font-medium'>상태</th>
                  <th className='p-2'></th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className='border-b last:border-0'>
                    <td className='p-2'>{v.kind === 'recurring' ? '정기' : '일일'}</td>
                    <td className='p-2'>{v.price.toLocaleString()}원</td>
                    <td className='p-2 whitespace-nowrap'>
                      {v.sale_start_date} ~ {v.sale_end_date}
                    </td>
                    <td className='p-2 whitespace-nowrap'>
                      {v.product_start_date} ~ {v.product_end_date}
                    </td>
                    <td className='p-2'>
                      {v.max_capacity == null ? '무제한' : `${v.max_capacity}명`}
                    </td>
                    <td className='p-2'>{STATUS_LABEL[v.status]}</td>
                    <td className='p-2 whitespace-nowrap'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => openEditVariant(v)}
                      >
                        수정
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='text-destructive ml-1'
                        onClick={() => void removeVariant(v)}
                      >
                        <Trash2 className='size-4' />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {variantFormOpen && (
          <form onSubmit={submitVariant} className='space-y-3 rounded-md border p-4'>
            {variantError && (
              <div className='bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'>
                {variantError}
              </div>
            )}

            <div>
              <label className='mb-1 block text-sm font-medium'>옵션 종류</label>
              <select
                className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
                value={variantForm.kind}
                onChange={(e) =>
                  setVariantForm((f) => ({ ...f, kind: e.target.value as VariantKind }))
                }
              >
                <option value='one_time'>일일</option>
                <option value='recurring'>정기 (월~금 묶음)</option>
              </select>
              {variantForm.kind === 'recurring' && (
                <p className='mt-1 text-xs text-amber-600'>
                  정기 옵션은 식사 시작=월요일, 종료=금요일이어야 합니다.
                </p>
              )}
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium'>가격(원)</label>
              <Input
                type='number'
                min={0}
                value={variantForm.price === 0 ? '' : String(variantForm.price)}
                onChange={(e) =>
                  setVariantForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))
                }
                required
              />
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <div>
                <label className='mb-1 block text-sm font-medium'>판매 시작</label>
                <Input
                  type='date'
                  value={variantForm.sale_start_date}
                  onChange={(e) =>
                    setVariantForm((f) => ({ ...f, sale_start_date: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className='mb-1 block text-sm font-medium'>판매 종료</label>
                <Input
                  type='date'
                  value={variantForm.sale_end_date}
                  onChange={(e) => setVariantForm((f) => ({ ...f, sale_end_date: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <div>
                <label className='mb-1 block text-sm font-medium'>식사 시작</label>
                <Input
                  type='date'
                  value={variantForm.product_start_date}
                  onChange={(e) =>
                    setVariantForm((f) => ({ ...f, product_start_date: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className='mb-1 block text-sm font-medium'>식사 종료</label>
                <Input
                  type='date'
                  value={variantForm.product_end_date}
                  onChange={(e) =>
                    setVariantForm((f) => ({ ...f, product_end_date: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium'>최대 인원 (비우면 무제한)</label>
              <Input
                type='number'
                min={1}
                value={variantForm.max_capacity == null ? '' : String(variantForm.max_capacity)}
                onChange={(e) =>
                  setVariantForm((f) => ({
                    ...f,
                    max_capacity: e.target.value === '' ? null : Number(e.target.value),
                  }))
                }
              />
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium'>상태</label>
              <select
                className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
                value={variantForm.status ?? 'active'}
                onChange={(e) =>
                  setVariantForm((f) => ({
                    ...f,
                    status: e.target.value as 'active' | 'inactive' | 'sold_out',
                  }))
                }
              >
                <option value='active'>판매중</option>
                <option value='inactive'>비활성</option>
                <option value='sold_out'>마감</option>
              </select>
            </div>

            <div className='flex gap-2'>
              <Button type='submit' size='sm' disabled={variantLoading}>
                {variantLoading ? <Loader2 className='size-4 animate-spin' /> : '저장'}
              </Button>
              <Button type='button' size='sm' variant='outline' onClick={cancelVariantForm}>
                취소
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
