import { Skeleton } from '@/components/ui/skeleton';

export default function StudentChatLoading() {
  return (
    <div
      className='bg-background fixed inset-x-0 flex justify-center'
      style={{
        top: 'calc(var(--app-safe-top) + 4.5rem)',
        bottom: 'calc(var(--app-safe-bottom) + 5rem)',
      }}
    >
      <div className='flex w-full max-w-lg flex-col bg-white'>
        {/* 채팅 헤더 */}
        <div className='border-b p-4'>
          <Skeleton className='mb-1 h-6 w-40' />
          <Skeleton className='h-4 w-56' />
        </div>

        {/* 메시지 영역 */}
        <div className='flex-1 space-y-4 overflow-hidden p-4'>
          {/* 날짜 구분선 */}
          <div className='flex items-center justify-center'>
            <Skeleton className='h-5 w-24 rounded-full' />
          </div>

          {/* 받은 메시지들 */}
          {[...Array(3)].map((_, i) => (
            <div key={`received-${i}`} className='flex gap-2'>
              <Skeleton className='h-8 w-8 flex-shrink-0 rounded-full' />
              <div className='space-y-1'>
                <Skeleton className='h-3 w-16' />
                <Skeleton className='h-16 w-48 rounded-2xl rounded-tl-none' />
              </div>
            </div>
          ))}

          {/* 보낸 메시지들 */}
          {[...Array(2)].map((_, i) => (
            <div key={`sent-${i}`} className='flex justify-end'>
              <Skeleton className='h-12 w-40 rounded-2xl rounded-tr-none' />
            </div>
          ))}
        </div>

        {/* 입력 영역 */}
        <div className='border-t p-4'>
          <div className='flex gap-2'>
            <Skeleton className='h-10 flex-1 rounded-full' />
            <Skeleton className='h-10 w-10 rounded-full' />
          </div>
        </div>
      </div>
    </div>
  );
}
