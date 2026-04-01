'use client';

import { useState } from 'react';
import { PointsList } from '@/components/student/points-list';
import { Card } from '@/components/ui/card';
import { Award, TrendingUp, TrendingDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PointRecord {
  id: string;
  type: 'reward' | 'penalty';
  amount: number;
  reason: string;
  isAuto: boolean;
  createdAt: string;
}

interface PointsSummary {
  reward: number;
  penalty: number;
  total: number;
}

export interface PointRuleRow {
  reason: string;
  amount: number;
}

interface PointsPageClientProps {
  points: PointRecord[];
  summary: PointsSummary;
  rewardPresets: PointRuleRow[];
  penaltyPresets: PointRuleRow[];
}

type FilterType = 'all' | 'reward' | 'penalty';

export function PointsPageClient({
  points,
  summary,
  rewardPresets,
  penaltyPresets,
}: PointsPageClientProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredPoints = filter === 'all' 
    ? points 
    : points.filter(p => p.type === filter);

  const filterButtons: { value: FilterType; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'reward', label: '상점' },
    { value: 'penalty', label: '벌점' },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Award className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text">상벌점 내역</h1>
          <p className="text-sm text-text-muted">나의 상점과 벌점 기록</p>
        </div>
      </div>

      {/* 누적 점수 */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">{summary.reward}</p>
          <p className="text-xs text-text-muted">상점</p>
        </Card>
        
        <Card className="p-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-500">{summary.penalty}</p>
          <p className="text-xs text-text-muted">벌점</p>
        </Card>
        
        <Card className={cn(
          'p-4 text-center',
          summary.total >= 0 ? 'bg-primary/5' : 'bg-red-50'
        )}>
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2',
            summary.total >= 0 ? 'bg-primary/20' : 'bg-red-100'
          )}>
            <Award className={cn(
              'w-5 h-5',
              summary.total >= 0 ? 'text-primary' : 'text-red-500'
            )} />
          </div>
          <p className={cn(
            'text-2xl font-bold',
            summary.total >= 0 ? 'text-primary' : 'text-red-500'
          )}>
            {summary.total >= 0 ? '+' : ''}{summary.total}
          </p>
          <p className="text-xs text-text-muted">총점</p>
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-text-muted" />
        <div className="flex gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setFilter(btn.value)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                filter === btn.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-muted hover:bg-gray-200'
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* 내역 목록 */}
      <PointsList points={filteredPoints} />

      {/* 상·벌점 규정 (지점 프리셋) */}
      <section className="space-y-4 pt-2">
        <h2 className="text-sm font-semibold text-text">상벌점 규정</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 상점 규정 */}
            <Card className="overflow-hidden border-green-200/80 bg-green-50/50 p-0">
              <div className="border-b border-green-200/80 bg-green-100/60 px-4 py-3">
                <h3 className="text-sm font-bold text-green-800">상점 규정</h3>
              </div>
              <div className="divide-y divide-green-100">
                <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 text-xs font-medium text-green-900/80">
                  <span>상점 규정</span>
                  <span className="text-right">상점</span>
                </div>
                {rewardPresets.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-text-muted">등록된 항목이 없습니다</p>
                ) : (
                  rewardPresets.map((row, i) => (
                    <div
                      key={`r-${i}-${row.reason}`}
                      className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3 text-sm"
                    >
                      <span className="text-text">{row.reason}</span>
                      <span className="text-right font-semibold text-green-700">{row.amount}점</span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* 벌점 규정 */}
            <Card className="overflow-hidden border-red-200/80 bg-red-50/50 p-0">
              <div className="border-b border-red-200/80 bg-red-100/60 px-4 py-3">
                <h3 className="text-sm font-bold text-red-800">벌점 규정</h3>
              </div>
              <div className="divide-y divide-red-100">
                <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 text-xs font-medium text-red-900/80">
                  <span>벌점 규정</span>
                  <span className="text-right">벌점</span>
                </div>
                {penaltyPresets.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-text-muted">등록된 항목이 없습니다</p>
                ) : (
                  penaltyPresets.map((row, i) => (
                    <div
                      key={`p-${i}-${row.reason}`}
                      className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3 text-sm"
                    >
                      <span className="text-text">{row.reason}</span>
                      <span className="text-right font-semibold text-red-600">{row.amount}점</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-gray-100/80 px-3 py-2.5 text-xs text-text-muted">
            <span aria-hidden className="shrink-0">
              ⚠
            </span>
            해당 상벌점은 사유에 따라 벌점의 부과 여부가 결정됩니다.
          </p>
        </section>
    </div>
  );
}
