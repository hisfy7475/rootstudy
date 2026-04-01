import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function StudentHomeLoading() {
  return (
    <div className="p-4 space-y-6">
      {/* 상태 배지 + 과목 선택 */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>

      {/* 타이머 */}
      <div className="flex flex-col items-center justify-center my-8">
        <Skeleton className="w-56 h-56 rounded-full" />
      </div>

      {/* 주간 학습 현황 */}
      <Card className="p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        
        {/* 프로그레스 바 */}
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-full rounded-full" />
        </div>

        {/* 요일별 달성 */}
        <div className="flex justify-between">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="w-10 h-10 rounded-full" />
              <Skeleton className="h-3 w-6" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
