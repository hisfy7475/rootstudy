'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MealImageUploader } from '@/components/shared/meal-image-uploader';
import { updateMealProduct, uploadMealProductImage, deleteMealProductImage, type MealProductAdminInput } from '@/lib/actions/meal';
import type { MealProduct } from '@/types/database';
import { CalendarDays, ListOrdered, Loader2 } from 'lucide-react';

interface AdminMealsDetailClientProps {
  product: MealProduct;
}

export function AdminMealsDetailClient({ product: initial }: AdminMealsDetailClientProps) {
  const [product, setProduct] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toFormState = (p: MealProduct) => ({
    name: p.name,
    meal_type: p.meal_type,
    price: String(p.price),
    sale_start_date: p.sale_start_date,
    sale_end_date: p.sale_end_date,
    meal_start_date: p.meal_start_date,
    meal_end_date: p.meal_end_date,
    max_capacity: p.max_capacity == null ? '' : String(p.max_capacity),
    description: p.description ?? '',
    status: p.status,
  });

  const [form, setForm] = useState(() => toFormState(initial));

  const isDirty =
    form.name !== product.name ||
    form.meal_type !== product.meal_type ||
    form.price !== String(product.price) ||
    form.sale_start_date !== product.sale_start_date ||
    form.sale_end_date !== product.sale_end_date ||
    form.meal_start_date !== product.meal_start_date ||
    form.meal_end_date !== product.meal_end_date ||
    form.max_capacity !== (product.max_capacity == null ? '' : String(product.max_capacity)) ||
    form.description !== (product.description ?? '') ||
    form.status !== product.status;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const price = Number(form.price.replace(/,/g, ''));
    if (Number.isNaN(price) || price < 0) {
      setError('가격을 올바르게 입력하세요.');
      return;
    }
    const maxRaw = form.max_capacity.trim();
    const max_capacity = maxRaw === '' ? null : Number(maxRaw);
    if (max_capacity != null && (Number.isNaN(max_capacity) || max_capacity <= 0)) {
      setError('정원은 양의 정수이거나 비워 두세요.');
      return;
    }

    setLoading(true);
    const res = await updateMealProduct(product.id, {
      name: form.name,
      meal_type: form.meal_type as MealProductAdminInput['meal_type'],
      price,
      sale_start_date: form.sale_start_date,
      sale_end_date: form.sale_end_date,
      meal_start_date: form.meal_start_date,
      meal_end_date: form.meal_end_date,
      max_capacity,
      description: form.description.trim() || null,
      status: form.status as MealProductAdminInput['status'],
    });
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.data) {
      setProduct(res.data);
      setMessage('저장되었습니다.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">상품 수정</h1>
          <p className="text-muted-foreground mt-1 text-sm">{product.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/meals/${product.id}/menus`}
            className="border-primary text-primary hover:bg-primary/10 inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-sm font-medium transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
          >
            <CalendarDays className="mr-2 size-4" />
            메뉴 입력
          </Link>
          <Link
            href={`/admin/meals/${product.id}/orders`}
            className="border-primary text-primary hover:bg-primary/10 inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-sm font-medium transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
          >
            <ListOrdered className="mr-2 size-4" />
            신청 현황
          </Link>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</div>
          )}
          {message && (
            <div className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900">{message}</div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">상품명</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">식사 유형</label>
            <select
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={form.meal_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, meal_type: e.target.value as MealProduct['meal_type'] }))
              }
            >
              <option value="lunch">중식</option>
              <option value="dinner">석식</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">가격(원)</label>
            <Input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">판매 시작</label>
              <Input
                type="date"
                value={form.sale_start_date}
                onChange={(e) => setForm((f) => ({ ...f, sale_start_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">판매 종료</label>
              <Input
                type="date"
                value={form.sale_end_date}
                onChange={(e) => setForm((f) => ({ ...f, sale_end_date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">식사 시작</label>
              <Input
                type="date"
                value={form.meal_start_date}
                onChange={(e) => setForm((f) => ({ ...f, meal_start_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">식사 종료</label>
              <Input
                type="date"
                value={form.meal_end_date}
                onChange={(e) => setForm((f) => ({ ...f, meal_end_date: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">최대 인원 (비우면 무제한)</label>
            <Input
              type="number"
              min={1}
              value={form.max_capacity}
              onChange={(e) => setForm((f) => ({ ...f, max_capacity: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">상태</label>
            <select
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as MealProduct['status'] }))}
            >
              <option value="active">판매중</option>
              <option value="inactive">비활성</option>
              <option value="sold_out">마감</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">설명</label>
            <textarea
              className="border-input bg-background min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <MealImageUploader
            currentUrl={product.image_url}
            onUpload={(fd) => uploadMealProductImage(product.id, fd)}
            onDelete={() => deleteMealProductImage(product.id)}
            placeholderSrc="/images/meal-product-placeholder.png"
          />

          <Button type="submit" disabled={loading || !isDirty}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : '저장'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
