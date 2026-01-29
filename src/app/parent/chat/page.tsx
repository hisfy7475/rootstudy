import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyChatRoom, getChatMessages } from '@/lib/actions/chat';
import { getLinkedStudents } from '@/lib/actions/parent';
import { ParentChatClient } from './chat-client';

interface PageProps {
  searchParams: Promise<{ childId?: string }>;
}

export default async function ParentChatPage({ searchParams }: PageProps) {
  const { childId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 연결된 자녀 목록 조회
  const linkedStudents = await getLinkedStudents();

  if (linkedStudents.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-text-muted">
          <p className="text-lg">연결된 학생이 없습니다.</p>
          <p className="text-sm mt-2">학생 코드로 자녀를 연결해주세요.</p>
        </div>
      </div>
    );
  }

  // 선택된 자녀 ID 결정 (URL 파라미터 또는 첫 번째 자녀)
  const selectedChildId = (childId && linkedStudents.some(s => s.id === childId))
    ? childId
    : linkedStudents[0].id;

  const selectedStudent = linkedStudents.find(s => s.id === selectedChildId);
  const studentName = selectedStudent?.name || '알 수 없음';

  // 학부모 본인 이름 조회
  const { data: parentProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  // 선택된 자녀의 채팅방 조회/생성
  const roomResult = await getMyChatRoom(selectedChildId);

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
