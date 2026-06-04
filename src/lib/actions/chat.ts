'use server';

import { createAdminClient, createClient } from '@/lib/supabase/server';

// ============================================
// 채팅방 관련
// ============================================

// 학생의 채팅방 조회 또는 생성
export async function getOrCreateChatRoom(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  // 기존 채팅방 조회 (RLS 적용 — 같은 지점 어드민/학부모/학생만 보임)
  const { data: existingRoom } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();

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

  if (newRoom) {
    return { data: newRoom };
  }

  // 동시 호출 시 UNIQUE(student_id) 충돌(23505)이 날 수 있다.
  // 그땐 다른 호출자가 이미 만들었다는 뜻이므로 admin 클라이언트로 재SELECT 하여 흡수.
  if ((insertError as { code?: string } | null)?.code === '23505') {
    const { data: raceRoom } = await adminSupabase
      .from('chat_rooms')
      .select('*')
      .eq('student_id', studentId)
      .single();
    if (raceRoom) {
      return { data: raceRoom };
    }
  }

  console.error('Error creating chat room:', insertError);
  return { error: '채팅방 생성에 실패했습니다.' };
}

// 현재 사용자의 채팅방 조회 (학생/학부모용)
// 학부모의 경우 studentId를 지정하면 해당 자녀의 채팅방을 조회
export async function getMyChatRoom(studentId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    // 학부모: 연결된 학생의 채팅방 (studentId가 지정되면 해당 학생, 아니면 첫 번째 활성 학생).
    // 퇴원 자녀와의 새 채팅 시작·진입은 차단한다 (과거 메시지 자체는 RLS 로 그대로 조회 가능).
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', user.id);

    if (!links || links.length === 0) {
      return { error: '연결된 학생이 없습니다.' };
    }

    const linkedIds = links.map((l) => l.student_id as string);
    const { data: activeProfiles } = await supabase
      .from('profiles')
      .select('id')
      .in('id', linkedIds)
      .is('withdrawn_at', null);
    const activeIds = new Set((activeProfiles ?? []).map((p) => p.id as string));

    // 특정 학생이 지정된 경우 연결 + 활성 여부 확인
    if (studentId) {
      if (!linkedIds.includes(studentId)) {
        return { error: '연결되지 않은 학생입니다.' };
      }
      if (!activeIds.has(studentId)) {
        return { error: '퇴원 처리된 자녀의 채팅방은 사용할 수 없습니다.' };
      }
      return getOrCreateChatRoom(studentId);
    }

    // 기본값: 첫 번째 활성 자녀의 채팅방
    const firstActiveId = linkedIds.find((id) => activeIds.has(id));
    if (!firstActiveId) {
      return { error: '활성 상태인 자녀가 없습니다.' };
    }
    return getOrCreateChatRoom(firstActiveId);
  }

  return { error: '권한이 없습니다.' };
}

// 학생용 미읽음 채팅 개수 조회
export async function getStudentUnreadChatCount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    .eq('is_read_by_student', false)
    .is('deleted_at', null);

  return { count: count || 0 };
}

// 학부모용 미읽음 채팅 개수 조회
export async function getParentUnreadChatCount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    .eq('is_read_by_parent', false)
    .is('deleted_at', null);

  return { count: count || 0 };
}

// 관리자용 미읽음 채팅 총 개수 조회 (자기 센터 학생만)
// chat_rooms.student_id → student_profiles → profiles 경유 조인 +
// auth.uid() 기반 자기 지점 필터링은 RPC 안에서 수행한다.
export async function getAdminUnreadChatCount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { count: 0 };

  const { data, error } = await supabase.rpc('get_admin_unread_chat_count');
  if (error) {
    console.error('Error fetching admin unread chat count:', error);
    return { count: 0 };
  }
  return { count: Number(data) || 0 };
}

// 관리자용 채팅방 목록 조회 (페이지네이션 + 서버사이드 검색)
// studentId 지정 시 단일 방 조회 모드로 동작 (외부 진입점에서 활용)
export async function getChatRoomList(options?: {
  limit?: number;
  offset?: number;
  search?: string;
  studentId?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const limit = options?.limit ?? 30;
  const offset = options?.offset ?? 0;
  const search = options?.search?.trim() || null;
  const studentId = options?.studentId ?? null;

  const { data: rooms, error } = await supabase.rpc('get_chat_room_list', {
    p_limit: limit + 1,
    p_offset: offset,
    p_search: search,
    p_admin_id: user.id,
    p_student_id: studentId,
  });

  if (error) {
    console.error('Error fetching chat rooms:', error);
    return { error: '채팅방 목록을 가져오는데 실패했습니다.' };
  }

  const allRows = rooms || [];
  const hasMore = allRows.length > limit;
  const sliced = hasMore ? allRows.slice(0, limit) : allRows;

  const formatted = sliced.map(
    (room: {
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
    }),
  );

  return { data: formatted, hasMore };
}

// ============================================
// 메시지 관련
// ============================================

// 메시지 포맷 변환 헬퍼
function formatMessages(messages: Array<Record<string, unknown>>) {
  return messages.map((msg) => {
    const senderProfile = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles;

    const sp = senderProfile as { user_type?: string; name?: string } | null;
    const senderName = sp?.user_type === 'admin' ? '루트스터디센터' : sp?.name || '알 수 없음';

    return {
      id: msg.id as string,
      room_id: msg.room_id as string,
      sender_id: msg.sender_id as string,
      sender_name: senderName,
      sender_type: sp?.user_type || 'unknown',
      content: msg.content as string,
      image_url: msg.image_url as string | null,
      file_url: (msg.file_url as string | null | undefined) ?? null,
      file_name: (msg.file_name as string | null | undefined) ?? null,
      file_type: (msg.file_type as string | null | undefined) ?? null,
      is_read_by_student: msg.is_read_by_student as boolean,
      is_read_by_parent: msg.is_read_by_parent as boolean,
      is_read_by_admin: msg.is_read_by_admin as boolean,
      created_at: msg.created_at as string,
      deleted_at: (msg.deleted_at as string | null | undefined) ?? null,
    };
  });
}

// 채팅 메시지 목록 조회 (최근 N개, 페이지네이션)
export async function getChatMessages(roomId: string, limit = 50) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  // adminClient로 조회: parent 프로필 등 RLS로 막히는 sender profiles도 정상 조인
  const adminSupabase = createAdminClient();
  const { data: messages, error } = await adminSupabase
    .from('chat_messages')
    .select(
      `
      *,
      profiles:sender_id (
        name,
        user_type
      )
    `,
    )
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  // adminClient로 조회: parent 프로필 등 RLS로 막히는 sender profiles도 정상 조인
  const adminSupabase = createAdminClient();
  const { data: messages, error } = await adminSupabase
    .from('chat_messages')
    .select(
      `
      *,
      profiles:sender_id (
        name,
        user_type
      )
    `,
    )
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

// 첨부 업로드는 브라우저에서 Supabase Storage로 직접 수행한다.
// (uploadChatImage/uploadChatFile 서버 액션은 제거됨 — `src/lib/uploads/client.ts`의
//  uploadToBucketAsUser 사용. Vercel 서버 액션 본문 한계(~4.5MB) 우회 목적.)
// sendMessage는 결과 URL만 받아 검증 후 기록한다.

export type ChatFileAttachment = {
  url: string;
  fileName: string;
  mimeType?: string | null;
};

// 메시지 전송
// clientId: 클라이언트가 발송 시 crypto.randomUUID()로 생성한 uuid.
// (sender_id, client_message_id) partial unique 제약 + id 직접 INSERT 로
// 같은 메시지의 2중 발송이 unique_violation(23505) 으로 흡수된다.
export async function sendMessage(
  roomId: string,
  content: string,
  imageUrl?: string | null,
  fileAttachment?: ChatFileAttachment | null,
  clientId?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  if (!content.trim() && !imageUrl && !fileAttachment) {
    return { error: '메시지 내용을 입력해주세요.' };
  }

  if (imageUrl && fileAttachment) {
    return { error: '이미지와 파일을 동시에 보낼 수 없습니다.' };
  }

  // 첨부 URL 경량 검증: 웹/네이티브가 Storage에 직접 업로드하므로 클라가 URL을 만든다.
  // 본인 폴더의 정상 버킷 객체만 허용해 타 버킷/타인 파일 링크 주입을 차단한다.
  if (imageUrl && !imageUrl.includes(`/object/public/chat-images/${user.id}/`)) {
    return { error: '유효하지 않은 이미지 첨부입니다.' };
  }
  if (
    fileAttachment?.url &&
    !fileAttachment.url.includes(`/object/public/chat-files/${user.id}/`)
  ) {
    return { error: '유효하지 않은 파일 첨부입니다.' };
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

  // 채팅방의 학생이 퇴원 상태이면 신규 메시지 발송을 차단한다 (기존 메시지 조회는 허용).
  // 학부모/어드민이 퇴원 자녀 채팅방에 새 메시지를 남기지 못하도록.
  const { data: roomRow } = await supabase
    .from('chat_rooms')
    .select('student_id, profiles:student_id (withdrawn_at)')
    .eq('id', roomId)
    .maybeSingle();
  const roomStudent = roomRow as unknown as {
    student_id: string;
    profiles: { withdrawn_at: string | null } | null;
  } | null;
  if (roomStudent?.profiles?.withdrawn_at) {
    return { error: '퇴원 처리된 학생의 채팅방에는 메시지를 보낼 수 없습니다.' };
  }

  // 메시지 삽입 (발신자 타입에 따라 읽음 표시 설정).
  // clientId 가 있으면 PK(id)와 client_message_id 양쪽에 동일 uuid 를 박아
  // 동일 (sender_id, client_message_id) 재시도가 23505 로 흡수되도록 한다.
  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      ...(clientId ? { id: clientId, client_message_id: clientId } : {}),
      room_id: roomId,
      sender_id: user.id,
      content: content.trim(),
      image_url: imageUrl || null,
      file_url: fileAttachment?.url ?? null,
      file_name: fileAttachment?.fileName ?? null,
      file_type: fileAttachment ? 'file' : null,
      is_read_by_student: profile.user_type === 'student',
      is_read_by_parent: profile.user_type === 'parent',
      is_read_by_admin: profile.user_type === 'admin',
    })
    .select()
    .single();

  // 동일 clientId 재시도: 첫 호출에서 이미 INSERT + 알림 발송이 끝났으므로
  // 기존 row 만 재SELECT 해서 그대로 반환하고 알림 재발송은 스킵한다.
  if (error && (error as { code?: string }).code === '23505' && clientId) {
    const { data: existing } = await supabase
      .from('chat_messages')
      .select()
      .eq('sender_id', user.id)
      .eq('client_message_id', clientId)
      .maybeSingle();
    if (existing) {
      return { data: existing };
    }
  }

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
    fileName: fileAttachment?.fileName ?? null,
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
  fileName: string | null;
}) {
  const supabase = await createClient();
  const { createStudentNotification, createUserNotification } = await import('./notification');

  // 알림 메시지 생성
  const notificationMessage = params.fileName
    ? `📎 ${params.fileName}`
    : params.imageUrl
      ? params.content
        ? `📷 ${params.content.slice(0, 40)}...`
        : '📷 이미지를 보냈습니다'
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

  const parentIds = (parentLinks || []).map((link) => link.parent_id);

  // 관리자 목록 조회: 같은 지점의 일반 어드민 + 모든 슈퍼관리자(전 지점 알림 수신).
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', room.student_id)
    .single();

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .or(
      `is_super_admin.eq.true,branch_id.eq.${studentProfile?.branch_id || '00000000-0000-0000-0000-000000000000'}`,
    );

  const adminIds = (admins || []).map((admin) => admin.id);

  // 발신자 라벨 설정
  const getSenderLabel = () => {
    switch (params.senderType) {
      case 'student':
        return '학생';
      case 'parent':
        return '학부모님';
      case 'admin':
        return '관리자';
      default:
        return params.senderName;
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
      }),
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
          }),
        );
      }
    }
  }

  // 관리자에게 알림 (발신자가 관리자가 아닌 경우)
  // link 에 studentId 를 부착해 알림 탭 시 해당 학생 채팅방으로 직진하도록 한다.
  if (params.senderType !== 'admin') {
    const adminLink = `/admin/chat?studentId=${room.student_id}`;
    for (const adminId of adminIds) {
      if (adminId !== params.senderId) {
        notificationPromises.push(
          createUserNotification({
            userId: adminId,
            type: 'chat',
            title: `${senderLabel}의 새 메시지`,
            message: notificationMessage,
            link: adminLink,
          }),
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // 읽지 않은 메시지 업데이트 (삭제된 메시지는 카운트/푸시 정합성을 위해 제외)
  const { error } = await supabase
    .from('chat_messages')
    .update({ [updateColumn]: true })
    .eq('room_id', roomId)
    .eq(updateColumn, false)
    .is('deleted_at', null);

  if (error) {
    console.error('Error marking as read:', error);
    return { error: '읽음 표시 업데이트에 실패했습니다.' };
  }

  return { success: true };
}

// 읽지 않은 메시지 수 조회
export async function getUnreadCount(roomId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    .eq(readColumn, false)
    .is('deleted_at', null);

  if (error) {
    console.error('Error getting unread count:', error);
    return { count: 0 };
  }

  return { count: count || 0 };
}

// 채팅방 정보 조회 (학생 정보 포함)
export async function getChatRoomInfo(roomId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  const { data: room, error } = await supabase
    .from('chat_rooms')
    .select(
      `
      *,
      student_profiles!inner (
        id,
        seat_number,
        profiles!inner (
          name
        )
      )
    `,
    )
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

// ============================================
// 메시지 삭제 (본인 발신 + 5분 이내, soft delete)
// ============================================

const DELETE_WINDOW_MS = 5 * 60 * 1000;

// public Storage URL 에서 bucket 내부 경로를 추출.
// chat-files 는 ?download=원본파일명 쿼리스트링을 붙이지만 pathname 만 보므로 안전.
function parseStoragePath(publicUrl: string, bucket: string): string | null {
  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx < 0) return null;
    return decodeURIComponent(url.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

export async function deleteMessage(messageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: '로그인이 필요합니다.' };
  }

  // 권한·시간 사전 검증 (UX 메시지 명확화 — 최종 권위는 DB 트리거/RLS)
  const { data: msg, error: fetchError } = await supabase
    .from('chat_messages')
    .select('id, sender_id, created_at, deleted_at, image_url, file_url')
    .eq('id', messageId)
    .single();

  if (fetchError || !msg) {
    return { error: '메시지를 찾을 수 없습니다.' };
  }
  if (msg.sender_id !== user.id) {
    return { error: '본인이 보낸 메시지만 삭제할 수 있습니다.' };
  }
  if (msg.deleted_at) {
    return { error: '이미 삭제된 메시지입니다.' };
  }
  const ageMs = Date.now() - new Date(msg.created_at as string).getTime();
  if (ageMs > DELETE_WINDOW_MS) {
    return { error: '삭제할 수 있는 시간이 지났습니다. (5분 제한)' };
  }

  // DB 먼저 — 트리거가 컬럼-수준 변경 패턴을 검증
  const { error: updateError } = await supabase
    .from('chat_messages')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      content: '',
      image_url: null,
      file_url: null,
      file_name: null,
      file_type: null,
    })
    .eq('id', messageId);

  if (updateError) {
    console.error('Error soft-deleting message:', updateError);
    return { error: '메시지를 삭제하지 못했습니다.' };
  }

  // DB 성공 후 Storage 객체 제거. 실패해도 orphan 으로 두고 사용자에겐 성공 응답.
  const removals: Promise<unknown>[] = [];
  if (msg.image_url) {
    const path = parseStoragePath(msg.image_url as string, 'chat-images');
    if (path) {
      removals.push(supabase.storage.from('chat-images').remove([path]));
    }
  }
  if (msg.file_url) {
    const path = parseStoragePath(msg.file_url as string, 'chat-files');
    if (path) {
      removals.push(supabase.storage.from('chat-files').remove([path]));
    }
  }
  if (removals.length > 0) {
    const results = await Promise.allSettled(removals);
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('Storage remove failed:', r.reason);
      }
    }
  }

  return { success: true };
}

// ============================================
// 자주 쓰는 멘트 템플릿 (관리자 한정, 개인별)
// ============================================

export type ChatMessageTemplate = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

async function requireChatTemplateUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' as const };
  return { supabase, user };
}

export async function listChatTemplates() {
  const ctx = await requireChatTemplateUser();
  if ('error' in ctx) return { error: ctx.error };

  const { data, error } = await ctx.supabase
    .from('chat_message_templates')
    .select('*')
    .eq('user_id', ctx.user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error listing chat templates:', error);
    return { error: '템플릿 목록을 가져오지 못했습니다.' };
  }
  return { data: (data || []) as ChatMessageTemplate[] };
}

function sanitizeTemplateInput(title: string, content: string) {
  const t = title.trim();
  const c = content.trim();
  if (t.length === 0 || t.length > 30) {
    return { error: '제목은 1~30자여야 합니다.' as const };
  }
  if (c.length === 0 || c.length > 2000) {
    return { error: '본문은 1~2000자여야 합니다.' as const };
  }
  return { title: t, content: c };
}

export async function createChatTemplate(input: { title: string; content: string }) {
  const ctx = await requireChatTemplateUser();
  if ('error' in ctx) return { error: ctx.error };

  const v = sanitizeTemplateInput(input.title, input.content);
  if ('error' in v) return { error: v.error };

  // 새 항목은 기본적으로 맨 뒤
  const { data: maxRow } = await ctx.supabase
    .from('chat_message_templates')
    .select('sort_order')
    .eq('user_id', ctx.user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from('chat_message_templates')
    .insert({
      user_id: ctx.user.id,
      title: v.title,
      content: v.content,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    if (error.message?.includes('TEMPLATE_LIMIT_EXCEEDED')) {
      return { error: '템플릿은 최대 30개까지 추가할 수 있습니다.' };
    }
    console.error('Error creating chat template:', error);
    return { error: '템플릿을 추가하지 못했습니다.' };
  }
  return { data: data as ChatMessageTemplate };
}

export async function updateChatTemplate(id: string, patch: { title?: string; content?: string }) {
  const ctx = await requireChatTemplateUser();
  if ('error' in ctx) return { error: ctx.error };

  const update: { title?: string; content?: string } = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (t.length === 0 || t.length > 30) return { error: '제목은 1~30자여야 합니다.' };
    update.title = t;
  }
  if (patch.content !== undefined) {
    const c = patch.content.trim();
    if (c.length === 0 || c.length > 2000) return { error: '본문은 1~2000자여야 합니다.' };
    update.content = c;
  }
  if (Object.keys(update).length === 0) return { success: true };

  const { error } = await ctx.supabase
    .from('chat_message_templates')
    .update(update)
    .eq('id', id)
    .eq('user_id', ctx.user.id);

  if (error) {
    console.error('Error updating chat template:', error);
    return { error: '템플릿을 수정하지 못했습니다.' };
  }
  return { success: true };
}

export async function deleteChatTemplate(id: string) {
  const ctx = await requireChatTemplateUser();
  if ('error' in ctx) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from('chat_message_templates')
    .delete()
    .eq('id', id)
    .eq('user_id', ctx.user.id);

  if (error) {
    console.error('Error deleting chat template:', error);
    return { error: '템플릿을 삭제하지 못했습니다.' };
  }
  return { success: true };
}

export async function reorderChatTemplates(orderedIds: string[]) {
  const ctx = await requireChatTemplateUser();
  if ('error' in ctx) return { error: ctx.error };

  if (orderedIds.length === 0) return { success: true };

  // 본인 행만 업데이트되도록 user_id 도 같이 거름
  const updates = orderedIds.map((id, idx) =>
    ctx.supabase
      .from('chat_message_templates')
      .update({ sort_order: idx })
      .eq('id', id)
      .eq('user_id', ctx.user.id),
  );

  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) {
      console.error('Error reordering chat templates:', r.error);
      return { error: '템플릿 순서를 저장하지 못했습니다.' };
    }
  }
  return { success: true };
}
