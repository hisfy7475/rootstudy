import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function StudentSettingsLoading() {
  return (
    <div className="p-4 pb-24 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* 학부모 연결 코드 섹션 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <Skeleton className="h-9 w-40 mx-auto mb-3" />
          <Skeleton className="h-9 w-24 mx-auto rounded-lg" />
        </div>
        <Skeleton className="h-3 w-full mt-3" />
      </Card>

      {/* 내 정보 섹션 */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-8 w-14 rounded-lg" />
        </div>

        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 연결된 학부모 섹션 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-36" />
        </div>

        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 계정 관리 섹션 */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-20" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </Card>
    </div>
  );
}
