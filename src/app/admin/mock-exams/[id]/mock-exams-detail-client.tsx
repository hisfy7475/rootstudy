'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MealImageUploader } from '@/components/shared/meal-image-uploader';
import {
  updateMealProductAndVariant,
  uploadMealProductImage,
  deleteMealProductImage,
  type MealProductWithVariants,
  type MockExamOptionGroupWithOptions,
} from '@/lib/actions/meal';
import type { MealProduct, MealProductVariant } from '@/types/database';
import { ListOrdered, Loader2 } from 'lucide-react';
import {
  MockExamOptionEditor,
  optionEditorValueFromServer,
  optionEditorValueToInput,
  type OptionEditorValue,
} from '@/components/admin/mock-exam-option-editor';

interface AdminMockExamsDetailClientProps {
  product: MealProductWithVariants;
  optionGroups: MockExamOptionGroupWithOptions[];
}

export function AdminMockExamsDetailClient({
  product: initial,
  optionGroups: initialGroups,
}: AdminMockExamsDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [product, setProduct] = useState<MealProduct>(initial);
  const [variant, setVariant] = useState<MealProductVariant | null>(initial.variants[0] ?? null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: initial.name,
    price: variant ? String(variant.price) : '',
    sale_start_date: variant?.sale_start_date ?? '',
    sale_end_date: variant?.sale_end_date ?? '',
    product_start_date: variant?.product_start_date ?? '',
    product_end_date: variant?.product_end_date ?? '',
    max_capacity: variant?.max_capacity == null ? '' : String(variant.max_capacity),
    description: initial.description ?? '',
    status: initial.status,
  });
  const [optionGroups, setOptionGroups] = useState<OptionEditorValue[]>(() =>
    optionEditorValueFromServer(initialGroups),
  );

  // 등록 직후 이미지 업로드 실패 안내 (?image_error=...). 한 번 보여주고 쿼리 정리.
  useEffect(() => {
    const imageErr = searchParams.get('image_error');
    if (imageErr) {
      setError(`이미지 업로드 실패: ${imageErr}`);
      router.replace(`/admin/mock-exams/${initial.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!variant) {
      setError('옵션 정보가 없습니다.');
      return;
    }

    const price = Number(form.price.replace(/,/g, ''));
    if (Number.isNaN(price) || price < 0) return setError('가격을 올바르게 입력하세요.');
    const maxRaw = form.max_capacity.trim();
    const max_capacity = maxRaw === '' ? null : Number(maxRaw);
    if (max_capacity != null && (Number.isNaN(max_capacity) || max_capacity <= 0)) {
      return setError('정원은 양의 정수이거나 비워 두세요.');
    }

    for (const g of optionGroups) {
      if (g.name.trim() && g.options.every((o) => !o.name.trim())) {
        return setError(`"${g.name.trim()}" 그룹에 옵션을 1개 이상 입력하세요.`);
      }
      if (!g.name.trim() && g.options.some((o) => o.name.trim())) {
        return setError('옵션 그룹명을 입력하세요.');
      }
    }

    setLoading(true);
    const res = await updateMealProductAndVariant(product.id, variant.id, {
      product: {
        name: form.name,
        description: form.description.trim() || null,
        status: form.status,
      },
      variant: {
        kind: 'one_time',
        price,
        sale_start_date: form.sale_start_date,
        sale_end_date: form.sale_end_date,
        product_start_date: form.product_start_date,
        product_end_date: form.product_end_date,
        max_capacity,
        status: variant.status,
      },
      optionGroups: optionEditorValueToInput(optionGroups),
    });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }

    // 서버가 값을 정규화하지 않으므로 form 입력값 그대로 로컬 상태에 반영.
    setProduct((prev) => ({
      ...prev,
      name: form.name,
      description: form.description.trim() || null,
      status: form.status,
    }));
    setVariant((prev) =>
      prev
        ? {
            ...prev,
            price,
            sale_start_date: form.sale_start_date,
            sale_end_date: form.sale_end_date,
            product_start_date: form.product_start_date,
            product_end_date: form.product_end_date,
            max_capacity,
          }
        : prev,
    );
    setMessage('저장되었습니다.');
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
            href={`/admin/mock-exams/${product.id}/orders`}
            className='border-primary text-primary hover:bg-primary/10 focus:ring-primary inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-sm font-medium transition-all focus:ring-2 focus:ring-offset-2 focus:outline-none'
          >
            <ListOrdered className='mr-2 size-4' />
            신청 현황
          </Link>
        </div>
      </div>

      <Card className='p-6'>
        <form onSubmit={submit} className='space-y-4'>
          {error && (
            <div className='bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'>
              {error}
            </div>
          )}
          {message && (
            <div className='rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900'>
              {message}
            </div>
          )}

          <div>
            <label className='mb-1 block text-sm font-medium'>상품명</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
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
              <label className='mb-1 block text-sm font-medium'>신청 시작</label>
              <Input
                type='date'
                value={form.sale_start_date}
                onChange={(e) => setForm((f) => ({ ...f, sale_start_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className='mb-1 block text-sm font-medium'>신청 종료</label>
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
              <label className='mb-1 block text-sm font-medium'>시험 시작</label>
              <Input
                type='date'
                value={form.product_start_date}
                onChange={(e) => setForm((f) => ({ ...f, product_start_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className='mb-1 block text-sm font-medium'>시험 종료</label>
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
              value={form.max_capacity}
              onChange={(e) => setForm((f) => ({ ...f, max_capacity: e.target.value }))}
            />
          </div>

          <MockExamOptionEditor value={optionGroups} onChange={setOptionGroups} />

          <div>
            <label className='mb-1 block text-sm font-medium'>상태</label>
            <select
              className='border-input bg-background w-full rounded-md border px-3 py-2 text-sm'
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as MealProduct['status'] }))
              }
            >
              <option value='active'>판매중</option>
              <option value='inactive'>비활성</option>
              <option value='sold_out'>마감</option>
            </select>
          </div>

          <div>
            <label className='mb-1 block text-sm font-medium'>설명</label>
            <textarea
              className='border-input bg-background min-h-[80px] w-full rounded-md border px-3 py-2 text-sm'
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <MealImageUploader
            currentUrl={product.image_url}
            onUpload={(fd) => uploadMealProductImage(product.id, fd)}
            onDelete={() => deleteMealProductImage(product.id)}
            placeholderSrc='/images/meal-product-placeholder.png'
          />

          <Button type='submit' disabled={loading}>
            {loading ? <Loader2 className='size-4 animate-spin' /> : '저장'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
