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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 연결된 자녀 목록 조회
  const linkedStudents = await getLinkedStudents();

  if (linkedStudents.length === 0) {
    return (
      <div className='flex min-h-[60vh] items-center justify-center'>
        <div className='text-text-muted text-center'>
          <p className='text-lg'>연결된 학생이 없습니다.</p>
          <p className='mt-2 text-sm'>학생 코드로 자녀를 연결해주세요.</p>
        </div>
      </div>
    );
  }

  // 선택된 자녀 ID 결정.
  // URL 파라미터가 있으면 그 자녀(퇴원 자녀의 과거 대화 열람도 허용),
  // 없으면 재원 중인 자녀를 우선 기본 선택(퇴원 자녀로 자동 진입 방지).
  const firstActive = linkedStudents.find((s) => !s.withdrawnAt);
  const selectedChildId =
    childId && linkedStudents.some((s) => s.id === childId)
      ? childId
      : (firstActive ?? linkedStudents[0]).id;

  const selectedStudent = linkedStudents.find((s) => s.id === selectedChildId);
  const studentName = selectedStudent?.name || '알 수 없음';

  // 학부모 본인 이름 조회
  const { data: parentProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  // 선택된 자녀의 채팅방 조회/생성
  const roomResult = await getMyChatRoom(selectedChildId);

  if ('error' in roomResult || !('data' in roomResult) || !roomResult.data) {
    const errMsg = 'error' in roomResult ? roomResult.error : undefined;
    return (
      <div className='flex min-h-[60vh] items-center justify-center'>
        <div className='text-text-muted text-center'>
          <p className='text-lg'>채팅방을 불러올 수 없습니다.</p>
          <p className='mt-2 text-sm'>{errMsg}</p>
        </div>
      </div>
    );
  }

  const room = roomResult.data;

  // 최근 메시지 조회 (최대 50개)
  const messagesResult = await getChatMessages(room.id, 50);
  const messages = messagesResult.data || [];

  return (
    <ParentChatClient
      roomId={room.id}
      initialMessages={messages}
      initialHasMore={messagesResult.hasMore ?? false}
      currentUserId={user.id}
      currentUserName={parentProfile?.name || '나'}
      studentName={studentName}
    />
  );
}
