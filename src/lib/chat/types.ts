// 채팅 SSOT 레이어 공용 타입.
// ChatMessageData 정본은 chat-message-list.tsx 이며 여기서 재노출한다(순환 import 방지: type-only).
export type { ChatMessageData } from '@/components/shared/chat/chat-message-list';

export type ChatScope = 'student' | 'parent' | 'admin';

// 관리자 채팅방 목록 아이템 (getChatRoomList 결과 형태와 동일).
export interface ChatRoomItem {
  id: string;
  student_id: string;
  student_name: string;
  seat_number: number | null;
  unread_count: number;
  last_message: string | null;
  last_message_at: string;
  created_at: string;
}
