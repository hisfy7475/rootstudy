import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getChatRoomList } from '@/lib/actions/chat';
import { AdminChatClient } from './chat-client';

export default async function AdminChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 관리자 권한 확인 및 이름 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, name')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    redirect('/');
  }

  // 채팅방 목록 조회
  const roomsResult = await getChatRoomList();
  const rooms = roomsResult.data || [];

  return (
    <AdminChatClient
      initialRooms={rooms}
      currentUserId={user.id}
      currentUserName={profile.name || '관리자'}
    />
  );
}
