import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function ParentScheduleLoading() {
  return (
    <div className="p-4 space-y-4">
      {/* 탭 네비게이션 */}
      <div className="flex bg-gray-100 rounded-2xl p-1">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="flex-1 h-10 rounded-xl" />
        ))}
      </div>

      {/* 안내 카드 */}
      <Card className="p-3 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-2">
          <Skeleton className="w-4 h-4 rounded mt-0.5" />
          <Skeleton className="h-4 flex-1" />
        </div>
      </Card>

      {/* 일정 섹션 제목 */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-28" />
      </div>

      {/* 일정 카드 리스트 */}
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
              <div className="text-right space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 비활성 일정 섹션 */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        {[...Array(2)].map((_, i) => (
          <Card key={i} className="p-3 bg-gray-50 opacity-60">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
