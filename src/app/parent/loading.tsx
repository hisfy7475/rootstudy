import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function ParentHomeLoading() {
  return (
    <div className="p-4 space-y-4">
      {/* 승인 대기 스케줄 카드 */}
      <Card className="p-4 border-amber-200 bg-amber-50/50">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="p-3 bg-white rounded-xl border border-amber-100">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1">
                  <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-28" />
                    <div className="flex gap-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="w-8 h-8 rounded" />
                  <Skeleton className="w-8 h-8 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center mt-3">
          <Skeleton className="h-4 w-24" />
        </div>
      </Card>

      {/* 자녀별 카드 */}
      {[...Array(2)].map((_, index) => (
        <div key={index} className="space-y-3">
          {/* 자녀 구분 헤더 */}
          <div className="flex items-center gap-2 pt-2">
            <Skeleton className="w-6 h-6 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>

          {/* 학생 정보 카드 */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </Card>

          {/* 학생 상태 카드 */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      ))}

      {/* 자녀 관리 바로가기 */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-2xl" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="w-5 h-5" />
        </div>
      </Card>
    </div>
  );
}
