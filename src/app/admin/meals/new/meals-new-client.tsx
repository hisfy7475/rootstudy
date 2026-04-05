'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createMealProduct, uploadMealProductImage, type MealProductAdminInput } from '@/lib/actions/meal';
import { ArrowLeft, ImagePlus, Loader2, X } from 'lucide-react';

export function AdminMealsNewClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    meal_type: 'lunch' as MealProductAdminInput['meal_type'],
    price: '',
    sale_start_date: '',
    sale_end_date: '',
    meal_start_date: '',
    meal_end_date: '',
    max_capacity: '' as string,
    description: '',
    status: 'active' as MealProductAdminInput['status'],
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
    if (!form.name.trim()) {
      setError('상품명을 입력하세요.');
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setError('가격을 올바르게 입력하세요.');
      return;
    }
    if (
      !form.sale_start_date ||
    !form.sale_end_date ||
    !form.meal_start_date ||
    !form.meal_end_date
    ) {
      setError('날짜를 모두 입력하세요.');
      return;
    }

    const maxRaw = form.max_capacity.trim();
    const max_capacity = maxRaw === '' ? null : Number(maxRaw);
    if (max_capacity != null && (Number.isNaN(max_capacity) || max_capacity <= 0)) {
      setError('정원은 양의 정수이거나 비워 두세요(무제한).');
      return;
    }

    setLoading(true);
    const payload: MealProductAdminInput = {
      name: form.name,
      meal_type: form.meal_type,
      price,
      sale_start_date: form.sale_start_date,
      sale_end_date: form.sale_end_date,
      meal_start_date: form.meal_start_date,
      meal_end_date: form.meal_end_date,
      max_capacity,
      description: form.description.trim() || null,
      status: form.status,
    };

    const res = await createMealProduct(payload);

    if (res.error) {
      setLoading(false);
      setError(res.error);
      return;
    }

    if (res.data && imageFile) {
      const fd = new FormData();
      fd.append('file', imageFile);
      await uploadMealProductImage(res.data.id, fd);
    }

    setLoading(false);
    if (res.data) {
      router.push(`/admin/meals/${res.data.id}`);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/meals"
          aria-label="목록"
          className="text-text hover:bg-gray-100 inline-flex items-center justify-center rounded-2xl p-2 focus:ring-2 focus:ring-gray-300 focus:outline-none"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">급식 상품 등록</h1>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">상품명</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="예: 3월 중식"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">식사 유형</label>
            <select
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={form.meal_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, meal_type: e.target.value as MealProductAdminInput['meal_type'] }))
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
              placeholder="무제한"
              value={form.max_capacity}
              onChange={(e) => setForm((f) => ({ ...f, max_capacity: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">상태</label>
            <select
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as MealProductAdminInput['status'] }))
              }
            >
              <option value="active">판매중</option>
              <option value="inactive">비활성</option>
              <option value="sold_out">마감</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">설명 (선택)</label>
            <textarea
              className="border-input bg-background min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">대표 이미지 (선택)</label>
            <div
              className="relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-primary/50"
              onClick={() => imageInputRef.current?.click()}
            >
              {imagePreview ? (
                <Image
                  src={imagePreview}
                  alt="미리보기"
                  width={400}
                  height={300}
                  className="h-auto max-h-[200px] w-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <ImagePlus className="size-8" />
                  <span className="text-sm">클릭하여 이미지 선택</span>
                  <span className="text-xs">JPG, PNG, WebP, GIF (최대 5MB)</span>
                </div>
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageSelect(f);
              }}
            />
            {imageFile && (
              <button
                type="button"
                onClick={clearImage}
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" /> 이미지 제거
              </button>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : '등록'}
            </Button>
            <Link
              href="/admin/meals"
              className="border-primary text-primary hover:bg-primary/10 inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-base font-medium transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
            >
              취소
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
