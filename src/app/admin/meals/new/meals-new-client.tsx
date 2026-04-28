'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createMealProduct,
  uploadMealProductImage,
  type MealProductCreateInput,
  type VariantKind,
} from '@/lib/actions/meal';
import { ArrowLeft, ImagePlus, Loader2, X } from 'lucide-react';

function isoDayOfWeek(ymd: string): number | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return dow;
}

export function AdminMealsNewClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    meal_type: 'lunch' as 'lunch' | 'dinner',
    description: '',
    productStatus: 'active' as 'active' | 'inactive' | 'sold_out',
    variantKind: 'one_time' as VariantKind,
    price: '',
    sale_start_date: '',
    sale_end_date: '',
    product_start_date: '',
    product_end_date: '',
    max_capacity: '',
  });

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const price = Number(form.price.replace(/,/g, ''));
    if (!form.name.trim()) return setError('상품명을 입력하세요.');
    if (Number.isNaN(price) || price < 0) return setError('가격을 올바르게 입력하세요.');
    if (
      !form.sale_start_date ||
      !form.sale_end_date ||
      !form.product_start_date ||
      !form.product_end_date
    ) {
      return setError('날짜를 모두 입력하세요.');
    }

    if (form.variantKind === 'recurring') {
      if (isoDayOfWeek(form.product_start_date) !== 1) {
        return setError('정기 옵션은 월요일에 시작해야 합니다.');
      }
      if (isoDayOfWeek(form.product_end_date) !== 5) {
        return setError('정기 옵션은 금요일에 종료해야 합니다.');
      }
    }

    const maxRaw = form.max_capacity.trim();
    const max_capacity = maxRaw === '' ? null : Number(maxRaw);
    if (max_capacity != null && (Number.isNaN(max_capacity) || max_capacity <= 0)) {
      return setError('정원은 양의 정수이거나 비워 두세요(무제한).');
    }

    setLoading(true);
    const payload: MealProductCreateInput = {
      name: form.name,
      meal_type: form.meal_type,
      description: form.description.trim() || null,
      status: form.productStatus,
      variant: {
        kind: form.variantKind,
        price,
        sale_start_date: form.sale_start_date,
        sale_end_date: form.sale_end_date,
        product_start_date: form.product_start_date,
        product_end_date: form.product_end_date,
        max_capacity,
        status: 'active',
      },
    };

    const res = await createMealProduct(payload, 'meal');

    if (res.error) {
      setLoading(false);
      setError(res.error);
      return;
    }

    let imageError: string | null = null;
    if (res.data && imageFile) {
      const fd = new FormData();
      fd.append('file', imageFile);
      const uploadRes = await uploadMealProductImage(res.data.product_id, fd);
      if (uploadRes.error) imageError = uploadRes.error;
    }

    setLoading(false);
    if (res.data) {
      // 이미지 업로드 실패하더라도 상품은 이미 생성됨 → 좀비 상품 방지를 위해
      // 항상 상세 페이지로 이동. 실패 사유는 쿼리스트링으로 전달.
      const url = imageError
        ? `/admin/meals/${res.data.product_id}?image_error=${encodeURIComponent(imageError)}`
        : `/admin/meals/${res.data.product_id}`;
      router.push(url);
    }
  };

  return (
    <div className='mx-auto max-w-xl space-y-6 p-4 md:p-8'>
      <div className='flex items-center gap-3'>
        <Link
          href='/admin/meals'
          aria-label='목록'
          className='text-text inline-flex items-center justify-center rounded-2xl p-2 hover:bg-gray-100 focus:ring-2 focus:ring-gray-300 focus:outline-none'
        >
          <ArrowLeft className='size-5' />
        </Link>
        <div>
          <h1 className='text-2xl font-bold'>급식 상품 등록</h1>
        </div>
      </div>

      <Card className='p-6'>
        <form onSubmit={submit} className='space-y-6'>
          {error && (
            <div className='bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'>
              {error}
            </div>
          )}

          <section className='space-y-4'>
            <h2 className='text-muted-foreground text-sm font-semibold'>상품 정보</h2>

            <div>
              <label className='mb-1 block text-sm font-medium'>상품명</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder='예: 5월 카레덮밥'
                required
              />
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium'>식사 유형</label>
              <select
                className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
                value={form.meal_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, meal_type: e.target.value as 'lunch' | 'dinner' }))
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
                value={form.productStatus}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    productStatus: e.target.value as 'active' | 'inactive' | 'sold_out',
                  }))
                }
              >
                <option value='active'>판매중</option>
                <option value='inactive'>비활성</option>
                <option value='sold_out'>마감</option>
              </select>
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium'>설명 (선택)</label>
              <textarea
                className='border-input bg-background min-h-[80px] w-full rounded-md border px-3 py-2 text-sm'
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </section>

          <section className='space-y-4 border-t pt-6'>
            <div>
              <h2 className='text-muted-foreground text-sm font-semibold'>첫 옵션 정보</h2>
              <p className='text-muted-foreground mt-1 text-xs'>
                상품 등록 후 상세 페이지에서 옵션을 추가로 등록할 수 있습니다.
              </p>
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium'>옵션 종류</label>
              <select
                className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
                value={form.variantKind}
                onChange={(e) =>
                  setForm((f) => ({ ...f, variantKind: e.target.value as VariantKind }))
                }
              >
                <option value='one_time'>일일 (단일 결제)</option>
                <option value='recurring'>정기 (월~금 묶음)</option>
              </select>
              {form.variantKind === 'recurring' && (
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
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                required
              />
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div>
                <label className='mb-1 block text-sm font-medium'>판매 시작</label>
                <Input
                  type='date'
                  value={form.sale_start_date}
                  onChange={(e) => setForm((f) => ({ ...f, sale_start_date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className='mb-1 block text-sm font-medium'>판매 종료</label>
                <Input
                  type='date'
                  value={form.sale_end_date}
                  onChange={(e) => setForm((f) => ({ ...f, sale_end_date: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div>
                <label className='mb-1 block text-sm font-medium'>식사 시작</label>
                <Input
                  type='date'
                  value={form.product_start_date}
                  onChange={(e) => setForm((f) => ({ ...f, product_start_date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className='mb-1 block text-sm font-medium'>식사 종료</label>
                <Input
                  type='date'
                  value={form.product_end_date}
                  onChange={(e) => setForm((f) => ({ ...f, product_end_date: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <label className='mb-1 block text-sm font-medium'>최대 인원 (비우면 무제한)</label>
              <Input
                type='number'
                min={1}
                placeholder='무제한'
                value={form.max_capacity}
                onChange={(e) => setForm((f) => ({ ...f, max_capacity: e.target.value }))}
              />
            </div>
          </section>

          <section className='space-y-2 border-t pt-6'>
            <h2 className='text-muted-foreground text-sm font-semibold'>대표 이미지 (선택)</h2>
            <div
              className='border-muted-foreground/25 hover:border-primary/50 relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors'
              onClick={() => imageInputRef.current?.click()}
            >
              {imagePreview ? (
                <Image
                  src={imagePreview}
                  alt='미리보기'
                  width={400}
                  height={300}
                  className='h-auto max-h-[200px] w-full object-cover'
                  unoptimized
                />
              ) : (
                <div className='text-muted-foreground flex flex-col items-center gap-2 py-8'>
                  <ImagePlus className='size-8' />
                  <span className='text-sm'>클릭하여 이미지 선택</span>
                  <span className='text-xs'>JPG, PNG, WebP, GIF (최대 5MB)</span>
                </div>
              )}
            </div>
            <input
              ref={imageInputRef}
              type='file'
              accept='image/jpeg,image/png,image/webp,image/gif'
              className='hidden'
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageSelect(f);
              }}
            />
            {imageFile && (
              <button
                type='button'
                onClick={clearImage}
                className='text-muted-foreground hover:text-destructive mt-1 inline-flex items-center gap-1 text-xs'
              >
                <X className='size-3' /> 이미지 제거
              </button>
            )}
          </section>

          <div className='flex gap-2 pt-2'>
            <Button type='submit' disabled={loading}>
              {loading ? <Loader2 className='size-4 animate-spin' /> : '등록'}
            </Button>
            <Link
              href='/admin/meals'
              className='border-primary text-primary hover:bg-primary/10 focus:ring-primary inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-base font-medium transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none'
            >
              취소
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
