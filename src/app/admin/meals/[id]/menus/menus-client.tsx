'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { deleteMealMenu, upsertMealMenu } from '@/lib/actions/meal';
import type { MealMenu, MealProduct } from '@/types/database';
import { Loader2, Trash2 } from 'lucide-react';

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
      m.set(d, { text: '' });
    }
    for (const menu of initialMenus) {
      const key =
        typeof menu.date === 'string'
          ? menu.date.slice(0, 10)
          : (menu.date as unknown as string);
      m.set(key, { id: menu.id, text: menu.menu_text });
    }
    return m;
  }, [dates, initialMenus]);

  const [rows, setRows] = useState<Map<string, RowState>>(() => new Map(initialMap));
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const updateText = (date: string, text: string) => {
    setRows((prev) => {
      const next = new Map(prev);
      const cur = next.get(date) ?? { text: '' };
      next.set(date, { ...cur, text });
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
    const res = await upsertMealMenu(product.id, date, text);
    setSavingDate(null);
    if (res.error) {
      setFlash({ type: 'err', text: res.error });
      return;
    }
    setFlash({ type: 'ok', text: '저장되었습니다.' });
    setRows((prev) => {
      const next = new Map(prev);
      const id = res.menu?.id;
      next.set(date, { id, text: res.menu?.menu_text ?? text });
      return next;
    });
  };

  const removeMenu = async (date: string) => {
    const row = rows.get(date);
    if (!row?.id) {
      updateText(date, '');
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
      next.set(date, { text: '' });
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
          const row = rows.get(date) ?? { text: '' };
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
              <Button
                type="button"
                size="sm"
                disabled={savingDate === date}
                onClick={() => saveDate(date)}
              >
                {savingDate === date ? <Loader2 className="size-4 animate-spin" /> : '저장'}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
