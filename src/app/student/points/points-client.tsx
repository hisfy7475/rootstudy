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

interface PointsPageClientProps {
  points: PointRecord[];
  summary: PointsSummary;
}

type FilterType = 'all' | 'reward' | 'penalty';

export function PointsPageClient({ points, summary }: PointsPageClientProps) {
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

    </div>
  );
}
