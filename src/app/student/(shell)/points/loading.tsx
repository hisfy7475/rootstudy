import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function StudentPointsLoading() {
  return (
    <div className="p-4 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>

      {/* 누적 점수 카드들 */}
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4 text-center">
            <Skeleton className="w-10 h-10 rounded-xl mx-auto mb-2" />
            <Skeleton className="h-8 w-12 mx-auto mb-1" />
            <Skeleton className="h-3 w-8 mx-auto" />
          </Card>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-2">
        <Skeleton className="w-4 h-4 rounded" />
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-16 rounded-xl" />
          ))}
        </div>
      </div>

      {/* 내역 목록 */}
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-12" />
                </div>
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 안내 문구 */}
      <Card className="p-4">
        <Skeleton className="h-4 w-24 mb-3" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
