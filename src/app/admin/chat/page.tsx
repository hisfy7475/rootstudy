import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getChatRoomList, getChatMessages, getOrCreateChatRoom } from '@/lib/actions/chat';
import type { ChatMessageData } from '@/components/shared/chat';
import { AdminChatClient, type ChatRoomItem } from './chat-client';

type PageProps = {
  searchParams: Promise<{ studentId?: string }>;
};

export default async function AdminChatPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { studentId } = await searchParams;

  // 좌측 목록(첫 30개)과 학생 검증 쿼리는 독립적이므로 병렬화한다.
  const [roomsResult, targetStudent] = await Promise.all([
    getChatRoomList({ limit: 30, offset: 0 }),
    studentId
      ? supabase
          .from('profiles')
          .select('id, user_type, withdrawn_at, is_approved')
          .eq('id', studentId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
  ]);

  let initialSelectedRoom: ChatRoomItem | null = null;
  let initialSelectedMessages: ChatMessageData[] = [];
  let initialSelectedHasMore = false;

  if (studentId) {
    // 다층 방어: profiles RLS(같은 지점/슈퍼어드민)가 1차로 막고, 여기서 비-학생을 추가 차단.
    // 퇴원(withdrawn_at) 학생은 의도적으로 허용 — 관리자는 과거 채팅 이력을 항상 열람 가능해야 한다.
    // 미승인(is_approved=false) 학생은 차단 — get_chat_room_list RPC 가 미승인을 필터링하므로
    // 페이지 가드를 두지 않으면 빈 채팅 영역("채팅방을 선택해주세요")으로 들어가 UX 가 어색해진다.
    if (!targetStudent || targetStudent.user_type !== 'student' || !targetStudent.is_approved) {
      redirect('/admin/chat');
    }

    const roomRes = await getOrCreateChatRoom(studentId);
    if (roomRes.error || !roomRes.data) {
      redirect('/admin/chat');
    }

    const [single, msgs] = await Promise.all([
      getChatRoomList({ studentId, limit: 1 }),
      getChatMessages(roomRes.data.id, 50),
    ]);

    initialSelectedRoom = single.data?.[0] ?? null;
    initialSelectedMessages = msgs.data || [];
    initialSelectedHasMore = msgs.hasMore ?? false;
  }

  return (
    <AdminChatClient
      initialRooms={roomsResult.data || []}
      initialHasMore={roomsResult.hasMore ?? false}
      currentUserId={user.id}
      currentUserName={profile.name || '관리자'}
      initialSelectedRoom={initialSelectedRoom}
      initialSelectedMessages={initialSelectedMessages}
      initialSelectedHasMore={initialSelectedHasMore}
    />
  );
}
