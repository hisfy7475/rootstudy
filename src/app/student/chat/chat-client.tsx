'use client';

import { ChatRoom } from '@/components/shared/chat';
import { ChatMessageData } from '@/components/shared/chat';

interface StudentChatClientProps {
  roomId: string;
  initialMessages: ChatMessageData[];
  currentUserId: string;
  currentUserName: string;
}

export function StudentChatClient({
  roomId,
  initialMessages,
  currentUserId,
  currentUserName,
}: StudentChatClientProps) {
  return (
    <div className="fixed inset-0 top-16 bottom-20 bg-white">
      <ChatRoom
        roomId={roomId}
        initialMessages={initialMessages}
        currentUserId={currentUserId}
        currentUserType="student"
        currentUserName={currentUserName}
        title="학부모 · 관리자 채팅"
        subtitle="학부모와 관리자 선생님과 대화할 수 있어요"
      />
    </div>
  );
}
