import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyChatRoom, getChatMessages } from '@/lib/actions/chat';
import { ParentChatClient } from './chat-client';

export default async function ParentChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 연결된 학생 정보 조회
  const { data: link } = await supabase
    .from('parent_student_links')
    .select(`
      student_id,
      student_profiles!inner (
        id,
        seat_number,
        profiles!inner (
          name
        )
      )
    `)
    .eq('parent_id', user.id)
    .single();

  if (!link) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-text-muted">
          <p className="text-lg">연결된 학생이 없습니다.</p>
          <p className="text-sm mt-2">학생 코드로 자녀를 연결해주세요.</p>
        </div>
      </div>
    );
  }

  const studentProfile = Array.isArray(link.student_profiles)
    ? link.student_profiles[0]
    : link.student_profiles;
  const profile = studentProfile?.profiles;
  const profileData = Array.isArray(profile) ? profile[0] : profile;
  const studentName = profileData?.name || '알 수 없음';

  // 학부모 본인 이름 조회
  const { data: parentProfile } = await supabase
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

  // 메시지 목록 조회
  const messagesResult = await getChatMessages(room.id);
  const messages = messagesResult.data || [];

  return (
    <ParentChatClient
      roomId={room.id}
      initialMessages={messages}
      currentUserId={user.id}
      currentUserName={parentProfile?.name || '나'}
      studentName={studentName}
    />
  );
}
