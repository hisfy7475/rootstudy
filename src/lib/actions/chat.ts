'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================
// 채팅방 관련
// ============================================

// 학생의 채팅방 조회 또는 생성
export async function getOrCreateChatRoom(studentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  // 기존 채팅방 조회
  const { data: existingRoom, error: selectError } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('student_id', studentId)
    .single();

  if (existingRoom) {
    return { data: existingRoom };
  }

  // 없으면 새로 생성
  const { data: newRoom, error: insertError } = await supabase
    .from('chat_rooms')
    .insert({ student_id: studentId })
    .select()
    .single();

  if (insertError) {
    console.error('Error creating chat room:', insertError);
    return { error: '채팅방 생성에 실패했습니다.' };
  }

  return { data: newRoom };
}

// 현재 사용자의 채팅방 조회 (학생/학부모용)
export async function getMyChatRoom() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  // 사용자 타입 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return { error: '프로필을 찾을 수 없습니다.' };
  }

  if (profile.user_type === 'student') {
    // 학생: 본인의 채팅방
    return getOrCreateChatRoom(user.id);
  } else if (profile.user_type === 'parent') {
    // 학부모: 연결된 학생의 채팅방
    const { data: link } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', user.id)
      .single();

    if (!link) {
      return { error: '연결된 학생이 없습니다.' };
    }

    return getOrCreateChatRoom(link.student_id);
  }

  return { error: '권한이 없습니다.' };
}

// 관리자용 채팅방 목록 조회
export async function getChatRoomList() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  // 관리자 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: '관리자 권한이 필요합니다.' };
  }

  // 모든 채팅방 조회 (학생 정보 포함)
  const { data: rooms, error } = await supabase
    .from('chat_rooms')
    .select(`
      *,
      student_profiles!inner (
        id,
        seat_number,
        profiles!inner (
          name
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching chat rooms:', error);
    return { error: '채팅방 목록을 가져오는데 실패했습니다.' };
  }

  // 각 채팅방의 읽지 않은 메시지 수 계산
  const roomsWithUnread = await Promise.all(
    (rooms || []).map(async (room) => {
      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .eq('is_read_by_admin', false);

      // 마지막 메시지 조회
      const { data: lastMessage } = await supabase
        .from('chat_messages')
        .select('content, created_at, sender_id')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const studentProfile = Array.isArray(room.student_profiles)
        ? room.student_profiles[0]
        : room.student_profiles;

      const profile = studentProfile?.profiles;
      const profileData = Array.isArray(profile) ? profile[0] : profile;

      return {
        id: room.id,
        student_id: room.student_id,
        student_name: profileData?.name || '알 수 없음',
        seat_number: studentProfile?.seat_number || null,
        unread_count: count || 0,
        last_message: lastMessage?.content || null,
        last_message_at: lastMessage?.created_at || room.created_at,
        created_at: room.created_at,
      };
    })
  );

  // 마지막 메시지 시간순 정렬
  roomsWithUnread.sort((a, b) => 
    new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );

  return { data: roomsWithUnread };
}

// ============================================
// 메시지 관련
// ============================================

// 채팅 메시지 목록 조회
export async function getChatMessages(roomId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select(`
      *,
      profiles:sender_id (
        name,
        user_type
      )
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching messages:', error);
    return { error: '메시지를 가져오는데 실패했습니다.' };
  }

  // 메시지 형식 변환
  const formattedMessages = (messages || []).map((msg) => {
    const senderProfile = Array.isArray(msg.profiles) 
      ? msg.profiles[0] 
      : msg.profiles;

    return {
      id: msg.id,
      room_id: msg.room_id,
      sender_id: msg.sender_id,
      sender_name: senderProfile?.name || '알 수 없음',
      sender_type: senderProfile?.user_type || 'unknown',
      content: msg.content,
      is_read_by_student: msg.is_read_by_student,
      is_read_by_parent: msg.is_read_by_parent,
      is_read_by_admin: msg.is_read_by_admin,
      created_at: msg.created_at,
    };
  });

  return { data: formattedMessages };
}

// 메시지 전송
export async function sendMessage(roomId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  if (!content.trim()) {
    return { error: '메시지 내용을 입력해주세요.' };
  }

  // 사용자 타입 및 이름 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, name')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return { error: '프로필을 찾을 수 없습니다.' };
  }

  // 메시지 삽입 (발신자 타입에 따라 읽음 표시 설정)
  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      room_id: roomId,
      sender_id: user.id,
      content: content.trim(),
      is_read_by_student: profile.user_type === 'student',
      is_read_by_parent: profile.user_type === 'parent',
      is_read_by_admin: profile.user_type === 'admin',
    })
    .select()
    .single();

  if (error) {
    console.error('Error sending message:', error);
    return { error: '메시지 전송에 실패했습니다.' };
  }

  // 학생에게 채팅 알림 발송 (발신자가 학생이 아닌 경우)
  if (profile.user_type !== 'student') {
    // 채팅방의 학생 ID 조회
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('student_id')
      .eq('id', roomId)
      .single();

    if (room?.student_id) {
      const { createStudentNotification } = await import('./notification');
      const senderLabel = profile.user_type === 'admin' ? '선생님' : '학부모님';
      await createStudentNotification({
        studentId: room.student_id,
        type: 'chat',
        title: `${senderLabel}의 새 메시지`,
        message: content.trim().slice(0, 50) + (content.trim().length > 50 ? '...' : ''),
        link: '/student/chat',
      }).catch(console.error);
    }
  }

  return { data: message };
}

// 읽음 표시 업데이트
export async function markAsRead(roomId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  // 사용자 타입 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return { error: '프로필을 찾을 수 없습니다.' };
  }

  // 타입에 따라 읽음 표시 컬럼 결정
  let updateColumn: string;
  switch (profile.user_type) {
    case 'student':
      updateColumn = 'is_read_by_student';
      break;
    case 'parent':
      updateColumn = 'is_read_by_parent';
      break;
    case 'admin':
      updateColumn = 'is_read_by_admin';
      break;
    default:
      return { error: '알 수 없는 사용자 타입입니다.' };
  }

  // 읽지 않은 메시지 업데이트
  const { error } = await supabase
    .from('chat_messages')
    .update({ [updateColumn]: true })
    .eq('room_id', roomId)
    .eq(updateColumn, false);

  if (error) {
    console.error('Error marking as read:', error);
    return { error: '읽음 표시 업데이트에 실패했습니다.' };
  }

  return { success: true };
}

// 읽지 않은 메시지 수 조회
export async function getUnreadCount(roomId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { count: 0 };
  }

  // 사용자 타입 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return { count: 0 };
  }

  // 타입에 따라 읽음 표시 컬럼 결정
  let readColumn: string;
  switch (profile.user_type) {
    case 'student':
      readColumn = 'is_read_by_student';
      break;
    case 'parent':
      readColumn = 'is_read_by_parent';
      break;
    case 'admin':
      readColumn = 'is_read_by_admin';
      break;
    default:
      return { count: 0 };
  }

  const { count, error } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq(readColumn, false);

  if (error) {
    console.error('Error getting unread count:', error);
    return { count: 0 };
  }

  return { count: count || 0 };
}

// 채팅방 정보 조회 (학생 정보 포함)
export async function getChatRoomInfo(roomId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  const { data: room, error } = await supabase
    .from('chat_rooms')
    .select(`
      *,
      student_profiles!inner (
        id,
        seat_number,
        profiles!inner (
          name
        )
      )
    `)
    .eq('id', roomId)
    .single();

  if (error) {
    console.error('Error fetching chat room:', error);
    return { error: '채팅방 정보를 가져오는데 실패했습니다.' };
  }

  const studentProfile = Array.isArray(room.student_profiles)
    ? room.student_profiles[0]
    : room.student_profiles;

  const profile = studentProfile?.profiles;
  const profileData = Array.isArray(profile) ? profile[0] : profile;

  return {
    data: {
      id: room.id,
      student_id: room.student_id,
      student_name: profileData?.name || '알 수 없음',
      seat_number: studentProfile?.seat_number || null,
      created_at: room.created_at,
    },
  };
}
