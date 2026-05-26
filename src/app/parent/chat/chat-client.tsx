'use client';

import { ChatRoom } from '@/components/shared/chat';
import { ChatMessageData } from '@/components/shared/chat';

interface ParentChatClientProps {
  roomId: string;
  initialMessages: ChatMessageData[];
  initialHasMore: boolean;
  currentUserId: string;
  currentUserName: string;
  studentName: string;
}

export function ParentChatClient({
  roomId,
  initialMessages,
  initialHasMore,
  currentUserId,
  currentUserName,
  studentName,
}: ParentChatClientProps) {
  return (
    <div
      className='bg-background fixed inset-x-0 flex justify-center'
      style={{
        // 헤더·하단탭 컴포넌트가 ResizeObserver 로 publish 하는 CSS 변수.
        // 사용자/자녀 이름 줄바꿈 등으로 헤더 높이가 변해도 자동 보정된다.
        top: 'calc(env(safe-area-inset-top, 0px) + var(--app-header-height, 4.5rem))',
        bottom: 'var(--app-bottom-nav-height, calc(env(safe-area-inset-bottom, 0px) + 5rem))',
      }}
    >
      <div className='h-full w-full max-w-lg bg-white'>
        <ChatRoom
          roomId={roomId}
          initialMessages={initialMessages}
          initialHasMore={initialHasMore}
          currentUserId={currentUserId}
          currentUserType='parent'
          currentUserName={currentUserName}
          title={`${studentName} 채팅방`}
          subtitle='자녀와 관리자와 대화할 수 있어요'
        />
      </div>
    </div>
  );
}
