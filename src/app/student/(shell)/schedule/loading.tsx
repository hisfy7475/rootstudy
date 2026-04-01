import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function StudentScheduleLoading() {
  return (
    <div className="p-4 pb-24 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-48" />
        </div>
        {/* 뷰 모드 토글 */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <Skeleton className="h-8 w-10 rounded-lg" />
          <Skeleton className="h-8 w-10 rounded-lg" />
        </div>
      </div>

      {/* 안내 메시지 */}
      <Card className="p-3 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-2">
          <Skeleton className="w-4 h-4 rounded mt-0.5" />
          <Skeleton className="h-4 flex-1" />
        </div>
      </Card>

      {/* 타임라인 스켈레톤 */}
      <Card className="p-4">
        <div className="space-y-4">
          {/* 요일 헤더 */}
          <div className="flex gap-2">
            <Skeleton className="w-12 h-6" />
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="flex-1 h-6 rounded" />
            ))}
          </div>
          
          {/* 타임라인 그리드 */}
          <div className="flex gap-2">
            <div className="w-12 space-y-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-4 w-10" />
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7 gap-2">
              {[...Array(56)].map((_, i) => (
                <Skeleton key={i} className="h-8 rounded" />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 추가 버튼 */}
      <Skeleton className="h-10 w-full rounded-lg" />

      {/* 일정 리스트 */}
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
