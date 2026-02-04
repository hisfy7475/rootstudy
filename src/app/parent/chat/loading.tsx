import { Skeleton } from '@/components/ui/skeleton';

export default function ParentChatLoading() {
  return (
    <div className="fixed inset-0 top-16 bottom-20 bg-white flex flex-col">
      {/* 채팅 헤더 */}
      <div className="p-4 border-b">
        <Skeleton className="h-6 w-32 mb-1" />
        <Skeleton className="h-4 w-56" />
      </div>

      {/* 자녀 선택 탭 (여러 자녀가 있을 경우) */}
      <div className="p-3 border-b">
        <div className="flex gap-2">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-lg" />
          ))}
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        {/* 날짜 구분선 */}
        <div className="flex items-center justify-center">
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>

        {/* 받은 메시지들 */}
        {[...Array(3)].map((_, i) => (
          <div key={`received-${i}`} className="flex gap-2">
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-16 w-52 rounded-2xl rounded-tl-none" />
            </div>
          </div>
        ))}

        {/* 보낸 메시지들 */}
        {[...Array(2)].map((_, i) => (
          <div key={`sent-${i}`} className="flex justify-end">
            <Skeleton className="h-12 w-44 rounded-2xl rounded-tr-none" />
          </div>
        ))}
      </div>

      {/* 입력 영역 */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Skeleton className="flex-1 h-10 rounded-full" />
          <Skeleton className="w-10 h-10 rounded-full" />
        </div>
      </div>
    </div>
  );
}
