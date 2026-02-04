import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function StudentStatsLoading() {
  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>

      {/* 기간 선택 탭 */}
      <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="flex-1 h-10 rounded-lg" />
        ))}
      </div>

      {/* 날짜 네비게이션 */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
      </Card>

      {/* 총 학습 시간 카드 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-9 w-32" />
      </Card>

      {/* 과목별 학습시간 카드 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 추이 그래프 카드 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </Card>
    </div>
  );
}
