'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { deleteMealMenu, upsertMealMenu, uploadMealMenuImage, deleteMealMenuImage } from '@/lib/actions/meal';
import type { MealMenu, MealProduct } from '@/types/database';
import { ImagePlus, Loader2, Trash2, X } from 'lucide-react';

function enumerateMealDates(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(`${start}T12:00:00+09:00`);
  const endT = new Date(`${end}T12:00:00+09:00`).getTime();
  while (cur.getTime() <= endT) {
    out.push(cur.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

interface RowState {
  id?: string;
  text: string;
  /** 마지막 저장된 텍스트 (dirty 판별용) */
  savedText: string;
  imageUrl?: string | null;
  /** 아직 업로드하지 않은 로컬 파일 */
  pendingFile?: File | null;
  /** 로컬 blob preview URL */
  pendingPreview?: string | null;
}

interface AdminMealMenusClientProps {
  product: MealProduct;
  initialMenus: MealMenu[];
}

export function AdminMealMenusClient({ product, initialMenus }: AdminMealMenusClientProps) {
  const dates = useMemo(
    () => enumerateMealDates(product.meal_start_date, product.meal_end_date),
    [product.meal_start_date, product.meal_end_date]
  );

  const initialMap = useMemo(() => {
    const m = new Map<string, RowState>();
    for (const d of dates) {
      m.set(d, { text: '', savedText: '' });
    }
    for (const menu of initialMenus) {
      const key =
        typeof menu.date === 'string'
          ? menu.date.slice(0, 10)
          : (menu.date as unknown as string);
      m.set(key, { id: menu.id, text: menu.menu_text, savedText: menu.menu_text, imageUrl: menu.image_url });
    }
    return m;
  }, [dates, initialMenus]);

  const [rows, setRows] = useState<Map<string, RowState>>(() => new Map(initialMap));
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [deletingImageDate, setDeletingImageDate] = useState<string | null>(null);

  const updateText = (date: string, text: string) => {
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(date) ?? { text: '', savedText: '' };
      next.set(date, { ...cur, text });
      return next;
    });
  };

  const setPendingImage = (date: string, file: File) => {
    const preview = URL.createObjectURL(file);
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(date) ?? { text: '', savedText: '' };
      if (cur.pendingPreview) URL.revokeObjectURL(cur.pendingPreview);
      next.set(date, { ...cur, pendingFile: file, pendingPreview: preview });
      return next;
    });
  };

  const clearPendingImage = (date: string) => {
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(date);
      if (!cur) return prev;
      if (cur.pendingPreview) URL.revokeObjectURL(cur.pendingPreview);
      next.set(date, { ...cur, pendingFile: null, pendingPreview: null });
      return next;
    });
  };

  const saveDate = async (date: string) => {
    const row = rows.get(date);
    const text = (row?.text ?? '').trim();
    if (!text) {
      setFlash({ type: 'err', text: '메뉴 내용을 입력하세요.' });
      return;
    }
    setSavingDate(date);
    setFlash(null);

    // 1) 메뉴 텍스트 저장
    const res = await upsertMealMenu(product.id, date, text);
    if (res.error) {
      setSavingDate(null);
      setFlash({ type: 'err', text: res.error });
      return;
    }

    const menuId = res.menu?.id;

    // 2) 대기 중인 이미지가 있으면 함께 업로드
    let uploadedUrl: string | null = null;
    if (row?.pendingFile && menuId) {
      const fd = new FormData();
      fd.append('file', row.pendingFile);
      const imgRes = await uploadMealMenuImage(product.id, menuId, fd);
      if (imgRes.error) {
        setSavingDate(null);
        setFlash({ type: 'err', text: `메뉴는 저장했으나 이미지 업로드 실패: ${imgRes.error}` });
        const savedMenuText = res.menu?.menu_text ?? text;
        setRows((prev) => {
          const next = new Map(prev);
          const cur = prev.get(date);
          next.set(date, {
            id: menuId,
            text: savedMenuText,
            savedText: savedMenuText,
            imageUrl: cur?.imageUrl ?? null,
            pendingFile: null,
            pendingPreview: null,
          });
          return next;
        });
        return;
      }
      uploadedUrl = imgRes.data?.url ?? null;
    }

    setSavingDate(null);
    setFlash({ type: 'ok', text: '저장되었습니다.' });

    const finalText = res.menu?.menu_text ?? text;
    setRows((prev) => {
      const next = new Map(prev);
      const existing = prev.get(date);
      if (existing?.pendingPreview) URL.revokeObjectURL(existing.pendingPreview);
      next.set(date, {
        id: menuId,
        text: finalText,
        savedText: finalText,
        imageUrl: uploadedUrl ?? existing?.imageUrl ?? null,
        pendingFile: null,
        pendingPreview: null,
      });
      return next;
    });
  };

  const handleDeleteServerImage = async (date: string) => {
    const row = rows.get(date);
    if (!row?.id || !row.imageUrl) return;
    if (!confirm('이 메뉴 이미지를 삭제할까요?')) return;
    setDeletingImageDate(date);
    setFlash(null);
    const res = await deleteMealMenuImage(product.id, row.id);
    setDeletingImageDate(null);
    if (res.error) {
      setFlash({ type: 'err', text: res.error });
      return;
    }
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(date);
      if (cur) next.set(date, { ...cur, imageUrl: null });
      return next;
    });
    setFlash({ type: 'ok', text: '이미지가 삭제되었습니다.' });
  };

  const removeMenu = async (date: string) => {
    const row = rows.get(date);
    if (!row?.id) {
      updateText(date, '');
      clearPendingImage(date);
      return;
    }
    if (!confirm('이 날짜 메뉴를 삭제할까요?')) return;
    setDeletingId(row.id);
    setFlash(null);
    const res = await deleteMealMenu(row.id);
    setDeletingId(null);
    if (res.error) {
      setFlash({ type: 'err', text: res.error });
      return;
    }
    setRows((prev) => {
      const next = new Map(prev);
      const cur = prev.get(date);
      if (cur?.pendingPreview) URL.revokeObjectURL(cur.pendingPreview);
      next.set(date, { text: '', savedText: '' });
      return next;
    });
    setFlash({ type: 'ok', text: '삭제되었습니다.' });
  };

  const weekdayKo = (dateYmd: string) => {
    const d = new Date(`${dateYmd}T12:00:00+09:00`);
    return d.toLocaleDateString('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">메뉴 입력</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {product.name} · {product.meal_start_date} ~ {product.meal_end_date}
          </p>
        </div>
        <Link
          href={`/admin/meals/${product.id}`}
          className="border-primary text-primary hover:bg-primary/10 inline-flex items-center justify-center rounded-2xl border-2 px-5 py-2.5 text-sm font-medium transition-all focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:outline-none"
        >
          상품 정보
        </Link>
      </div>

      {flash && (
        <div
          className={
            flash.type === 'ok'
              ? 'rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900'
              : 'bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm'
          }
        >
          {flash.text}
        </div>
      )}

      <div className="space-y-4">
        {dates.map((date) => {
          const row = rows.get(date) ?? { text: '', savedText: '' };
          const displayImage = row.pendingPreview ?? row.imageUrl;
          const isPending = !!row.pendingFile;
          const isBusy = savingDate === date;
          const textDirty = row.text.trim() !== (row.savedText ?? '');
          const isDirty = textDirty || isPending;
          const hasContent = row.text.trim().length > 0;

          return (
            <Card key={date} className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {date}{' '}
                  <span className="text-muted-foreground font-normal">({weekdayKo(date)})</span>
                </div>
                <div className="flex gap-2">
                  {row.id != null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={deletingId === row.id}
                      onClick={() => removeMenu(date)}
                    >
                      {deletingId === row.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <textarea
                className="border-input bg-background mb-3 min-h-[72px] w-full rounded-md border px-3 py-2 text-sm"
                placeholder="예: 쌀밥, 된장찌개, 불고기..."
                value={row.text}
                onChange={(e) => updateText(date, e.target.value)}
              />

              {/* 이미지 영역 */}
              <div className="mb-3">
                {displayImage ? (
                  <div className="relative inline-block">
                    <Image
                      src={displayImage}
                      alt={`${date} 식단 사진`}
                      width={200}
                      height={150}
                      className="rounded-md object-cover"
                      unoptimized
                    />
                    {isPending && (
                      <span className="absolute left-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        저장 시 업로드
                      </span>
                    )}
                    <button
                      type="button"
                      className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white shadow-sm hover:bg-destructive/90"
                      disabled={deletingImageDate === date || isBusy}
                      onClick={() => {
                        if (isPending) {
                          clearPendingImage(date);
                        } else {
                          void handleDeleteServerImage(date);
                        }
                      }}
                    >
                      {deletingImageDate === date ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <X className="size-3" />
                      )}
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                    <ImagePlus className="size-3.5" />
                    식단 사진 추가
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setPendingImage(date, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                disabled={isBusy || !isDirty || !hasContent}
                onClick={() => saveDate(date)}
              >
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : '저장'}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
