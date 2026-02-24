import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyChatRoom, getChatMessages } from '@/lib/actions/chat';
import { StudentChatClient } from './chat-client';

export default async function StudentChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 사용자 이름 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  // 채팅방 조회/생성
  const roomResult = await getMyChatRoom();

  if (roomResult.error || !roomResult.data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-text-muted">
          <p className="text-lg">채팅방을 불러올 수 없습니다.</p>
          <p className="text-sm mt-2">{roomResult.error}</p>
        </div>
      </div>
    );
  }

  const room = roomResult.data;

  // 최근 메시지 조회 (최대 50개)
  const messagesResult = await getChatMessages(room.id, 50);
  const messages = messagesResult.data || [];

  return (
    <StudentChatClient
      roomId={room.id}
      initialMessages={messages}
      initialHasMore={messagesResult.hasMore ?? false}
      currentUserId={user.id}
      currentUserName={profile?.name || '나'}
    />
  );
}
