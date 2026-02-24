'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';
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

  // 없으면 새로 생성 (RLS 우회를 위해 admin 클라이언트 사용)
  const adminSupabase = createAdminClient();
  const { data: newRoom, error: insertError } = await adminSupabase
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
// 학부모의 경우 studentId를 지정하면 해당 자녀의 채팅방을 조회
export async function getMyChatRoom(studentId?: string) {
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
    // 학부모: 연결된 학생의 채팅방 (studentId가 지정되면 해당 학생, 아니면 첫 번째 학생)
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', user.id);

    if (!links || links.length === 0) {
      return { error: '연결된 학생이 없습니다.' };
    }

    // 특정 학생이 지정된 경우 연결 확인
    if (studentId) {
      const isLinked = links.some(link => link.student_id === studentId);
      if (!isLinked) {
        return { error: '연결되지 않은 학생입니다.' };
      }
      return getOrCreateChatRoom(studentId);
    }

    // 기본값: 첫 번째 연결된 학생
    return getOrCreateChatRoom(links[0].student_id);
  }

  return { error: '권한이 없습니다.' };
}

// 학생용 미읽음 채팅 개수 조회
export async function getStudentUnreadChatCount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { count: 0 };

  const { data: room } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('student_id', user.id)
    .single();

  if (!room) return { count: 0 };

  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id)
    .eq('is_read_by_student', false);

  return { count: count || 0 };
}

// 학부모용 미읽음 채팅 개수 조회
export async function getParentUnreadChatCount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { count: 0 };

  const { data: links } = await supabase
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', user.id);

  if (!links || links.length === 0) return { count: 0 };

  const studentIds = links.map((l) => l.student_id);

  const { data: rooms } = await supabase
    .from('chat_rooms')
    .select('id')
    .in('student_id', studentIds);

  if (!rooms || rooms.length === 0) return { count: 0 };

  const roomIds = rooms.map((r) => r.id);

  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .in('room_id', roomIds)
    .eq('is_read_by_parent', false);

  return { count: count || 0 };
}

// 관리자용 미읽음 채팅 총 개수 조회
export async function getAdminUnreadChatCount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { count: 0 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') return { count: 0 };

  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('is_read_by_admin', false);

  return { count: count || 0 };
}

// 관리자용 채팅방 목록 조회 (단일 RPC로 N+1 해소)
export async function getChatRoomList() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_type !== 'admin') {
    return { error: '관리자 권한이 필요합니다.' };
  }

  const { data: rooms, error } = await supabase.rpc('get_chat_room_list');

  if (error) {
    console.error('Error fetching chat rooms:', error);
    return { error: '채팅방 목록을 가져오는데 실패했습니다.' };
  }

  const formatted = (rooms || []).map((room: {
    id: string;
    student_id: string;
    created_at: string;
    student_name: string;
    seat_number: number | null;
    unread_count: number;
    last_message: string | null;
    last_message_at: string;
  }) => ({
    id: room.id,
    student_id: room.student_id,
    student_name: room.student_name || '알 수 없음',
    seat_number: room.seat_number,
    unread_count: Number(room.unread_count) || 0,
    last_message: room.last_message,
    last_message_at: room.last_message_at || room.created_at,
    created_at: room.created_at,
  }));

  return { data: formatted };
}

// ============================================
// 메시지 관련
// ============================================

// 메시지 포맷 변환 헬퍼
function formatMessages(messages: Array<Record<string, unknown>>) {
  return messages.map((msg) => {
    const senderProfile = Array.isArray(msg.profiles)
      ? msg.profiles[0]
      : msg.profiles;

    const sp = senderProfile as { user_type?: string; name?: string } | null;
    const senderName = sp?.user_type === 'admin'
      ? '루트스터디센터'
      : (sp?.name || '알 수 없음');

    return {
      id: msg.id as string,
      room_id: msg.room_id as string,
      sender_id: msg.sender_id as string,
      sender_name: senderName,
      sender_type: sp?.user_type || 'unknown',
      content: msg.content as string,
      image_url: msg.image_url as string | null,
      is_read_by_student: msg.is_read_by_student as boolean,
      is_read_by_parent: msg.is_read_by_parent as boolean,
      is_read_by_admin: msg.is_read_by_admin as boolean,
      created_at: msg.created_at as string,
    };
  });
}

// 채팅 메시지 목록 조회 (최근 N개, 페이지네이션)
export async function getChatMessages(roomId: string, limit = 50) {
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
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching messages:', error);
    return { error: '메시지를 가져오는데 실패했습니다.' };
  }

  const reversed = (messages || []).reverse();
  return { data: formatMessages(reversed), hasMore: (messages || []).length >= limit };
}

// 이전 메시지 조회 (커서 기반 페이지네이션)
export async function getOlderMessages(roomId: string, before: string, limit = 50) {
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
    .lt('created_at', before)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching older messages:', error);
    return { error: '이전 메시지를 가져오는데 실패했습니다.' };
  }

  const reversed = (messages || []).reverse();
  return { data: formatMessages(reversed), hasMore: (messages || []).length >= limit };
}

// 이미지 업로드
export async function uploadChatImage(roomId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  const file = formData.get('file') as File;
  if (!file) {
    return { error: '파일이 없습니다.' };
  }

  // 파일 타입 검증
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { error: '지원하지 않는 이미지 형식입니다.' };
  }

  // 파일 크기 검증 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return { error: '이미지 크기는 5MB 이하여야 합니다.' };
  }

  // 파일명 생성 (user_id/roomId/timestamp.ext)
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${user.id}/${roomId}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from('chat-images')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Error uploading image:', error);
    return { error: '이미지 업로드에 실패했습니다.' };
  }

  // public URL 생성
  const { data: { publicUrl } } = supabase.storage
    .from('chat-images')
    .getPublicUrl(data.path);

  return { data: { url: publicUrl } };
}

// 메시지 전송
export async function sendMessage(roomId: string, content: string, imageUrl?: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  if (!content.trim() && !imageUrl) {
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
      image_url: imageUrl || null,
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

  // 채팅 알림 발송 (발신자를 제외한 모든 참여자에게)
  await sendChatNotifications({
    roomId,
    senderId: user.id,
    senderType: profile.user_type,
    senderName: profile.name,
    content: content.trim(),
    imageUrl: imageUrl || null,
  }).catch(console.error);

  return { data: message };
}

// 채팅 알림 발송 헬퍼 함수
async function sendChatNotifications(params: {
  roomId: string;
  senderId: string;
  senderType: string;
  senderName: string;
  content: string;
  imageUrl: string | null;
}) {
  const supabase = await createClient();
  const { createStudentNotification, createUserNotification } = await import('./notification');

  // 알림 메시지 생성
  const notificationMessage = params.imageUrl 
    ? (params.content ? `📷 ${params.content.slice(0, 40)}...` : '📷 이미지를 보냈습니다')
    : params.content.slice(0, 50) + (params.content.length > 50 ? '...' : '');

  // 채팅방의 학생 ID 조회
  const { data: room } = await supabase
    .from('chat_rooms')
    .select('student_id')
    .eq('id', params.roomId)
    .single();

  if (!room?.student_id) return;

  // 연결된 학부모 조회
  const { data: parentLinks } = await supabase
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', room.student_id);

  const parentIds = (parentLinks || []).map(link => link.parent_id);

  // 관리자 목록 조회 (같은 지점)
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', room.student_id)
    .single();

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .eq('branch_id', studentProfile?.branch_id || '');

  const adminIds = (admins || []).map(admin => admin.id);

  // 발신자 라벨 설정
  const getSenderLabel = () => {
    switch (params.senderType) {
      case 'student': return '학생';
      case 'parent': return '학부모님';
      case 'admin': return '선생님';
      default: return params.senderName;
    }
  };
  const senderLabel = getSenderLabel();

  // 발신자 유형에 따라 알림 발송 대상 결정
  const notificationPromises: Promise<unknown>[] = [];

  // 학생에게 알림 (발신자가 학생이 아닌 경우)
  if (params.senderType !== 'student') {
    notificationPromises.push(
      createStudentNotification({
        studentId: room.student_id,
        type: 'chat',
        title: `${senderLabel}의 새 메시지`,
        message: notificationMessage,
        link: '/student/chat',
      })
    );
  }

  // 학부모에게 알림 (발신자가 학부모가 아닌 경우)
  if (params.senderType !== 'parent') {
    for (const parentId of parentIds) {
      if (parentId !== params.senderId) {
        notificationPromises.push(
          createUserNotification({
            userId: parentId,
            type: 'chat',
            title: `${senderLabel}의 새 메시지`,
            message: notificationMessage,
            link: '/parent/chat',
          })
        );
      }
    }
  }

  // 관리자에게 알림 (발신자가 관리자가 아닌 경우)
  if (params.senderType !== 'admin') {
    for (const adminId of adminIds) {
      if (adminId !== params.senderId) {
        notificationPromises.push(
          createUserNotification({
            userId: adminId,
            type: 'chat',
            title: `${senderLabel}의 새 메시지`,
            message: notificationMessage,
            link: '/admin/chat',
          })
        );
      }
    }
  }

  // 모든 알림 발송
  await Promise.allSettled(notificationPromises);
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
