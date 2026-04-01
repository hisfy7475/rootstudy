'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MealProduct } from '@/types/database';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { UtensilsCrossed, Sun, Moon } from 'lucide-react';

type Student = { id: string; name: string };

function mealTypeLabel(t: MealProduct['meal_type']): string {
  return t === 'lunch' ? '중식' : '석식';
}

export function ParentMealsClient({
  initialProducts,
  students,
}: {
  initialProducts: MealProduct[];
  students: Student[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(students[0]?.id ?? null);

  if (students.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        연결된 자녀가 없습니다. 관리자에게 문의하세요.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <p className="text-xs text-muted-foreground mb-2">자녀 선택</p>
        <div className="flex flex-wrap gap-2">
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                selectedId === s.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border text-foreground'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </Card>

      {selectedId ? (
        <ul className="space-y-3">
          {initialProducts.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              현재 신청 가능한 급식이 없습니다.
            </Card>
          ) : (
            initialProducts.map((p) => (
              <li key={p.id}>
                <Link href={`/parent/meals/${p.id}?for=${encodeURIComponent(selectedId)}`}>
                  <Card className="p-4 active:scale-[0.99] transition-transform">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        {p.meal_type === 'lunch' ? (
                          <Sun className="w-5 h-5" />
                        ) : (
                          <Moon className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">
                            {mealTypeLabel(p.meal_type)}
                          </span>
                          <UtensilsCrossed className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </div>
                        <h2 className="font-semibold text-foreground mt-1 truncate">{p.name}</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          {p.price.toLocaleString('ko-KR')}원 · 판매 {p.sale_start_date} ~{' '}
                          {p.sale_end_date}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
