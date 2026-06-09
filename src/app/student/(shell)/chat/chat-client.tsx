'use client';

import { ChatRoom } from '@/components/shared/chat';
import { ChatMessageData } from '@/components/shared/chat';

interface StudentChatClientProps {
  roomId: string;
  initialMessages: ChatMessageData[];
  initialHasMore: boolean;
  currentUserId: string;
  currentUserName: string;
}

export function StudentChatClient({
  roomId,
  initialMessages,
  initialHasMore,
  currentUserId,
  currentUserName,
}: StudentChatClientProps) {
  return (
    <div
      className='bg-background fixed inset-x-0 flex justify-center'
      style={{
        // 헤더·하단탭 컴포넌트가 ResizeObserver 로 publish 하는 CSS 변수.
        // 사용자 이름 줄바꿈 등으로 헤더 높이가 변해도 자동 보정된다.
        top: 'calc(var(--app-safe-top) + var(--app-header-height, 4.5rem))',
        bottom: 'var(--app-bottom-nav-height, calc(var(--app-safe-bottom) + 5rem))',
      }}
    >
      <div className='h-full w-full max-w-lg bg-white'>
        <ChatRoom
          roomId={roomId}
          initialMessages={initialMessages}
          initialHasMore={initialHasMore}
          currentUserId={currentUserId}
          currentUserType='student'
          currentUserName={currentUserName}
          title='학부모 · 관리자 채팅'
          subtitle='학부모와 관리자와 대화할 수 있어요'
        />
      </div>
    </div>
  );
}
