'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { PointsSummary } from '@/lib/actions/report';

export interface PointsSummaryCardProps {
  points: PointsSummary;
}

function ItemList({
  title,
  items,
  tone,
}: {
  title: string;
  items: { reason: string; amount: number; count: number }[];
  tone: 'reward' | 'penalty';
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-xs font-semibold text-text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">내역 없음</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li
              key={`${item.reason}-${i}`}
              className="flex justify-between gap-2 text-xs"
            >
              <span className="min-w-0 truncate text-text">{item.reason}</span>
              <span
                className={
                  tone === 'reward' ? 'shrink-0 font-medium text-primary' : 'shrink-0 font-medium text-error'
                }
              >
                {item.amount}점
                {item.count > 1 ? ` ×${item.count}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PointsSummaryCard({ points }: PointsSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-text">개인 상벌점 현황</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between gap-4">
          <p className="text-xl font-bold text-primary">
            누적 상점 +{points.totalReward}
          </p>
          <p className="text-xl font-bold text-error">
            누적 벌점 -{points.totalPenalty}
          </p>
        </div>
        <div className="flex gap-6 border-t border-gray-100 pt-4">
          <ItemList title="상점 내역" items={points.rewardItems} tone="reward" />
          <ItemList title="벌점 내역" items={points.penaltyItems} tone="penalty" />
        </div>
      </CardContent>
    </Card>
  );
}
