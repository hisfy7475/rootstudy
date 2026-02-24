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
    <div className="fixed inset-x-0 top-16 bottom-20 flex justify-center bg-background">
      <div className="w-full max-w-lg bg-white">
        <ChatRoom
          roomId={roomId}
          initialMessages={initialMessages}
          initialHasMore={initialHasMore}
          currentUserId={currentUserId}
          currentUserType="parent"
          currentUserName={currentUserName}
          title={`${studentName} 채팅방`}
          subtitle="자녀와 관리자 선생님과 대화할 수 있어요"
        />
      </div>
    </div>
  );
}
