'use client';

import { useState, useEffect } from 'react';
import { ChatRoom } from '@/components/shared/chat';
import { ChatMessageData } from '@/components/shared/chat';
import { getChatMessages, getChatRoomList } from '@/lib/actions/chat';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle, User, Clock, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ChatRoomItem {
  id: string;
  student_id: string;
  student_name: string;
  seat_number: number | null;
  unread_count: number;
  last_message: string | null;
  last_message_at: string;
  created_at: string;
}

interface AdminChatClientProps {
  initialRooms: ChatRoomItem[];
  currentUserId: string;
  currentUserName: string;
}

export function AdminChatClient({
  initialRooms,
  currentUserId,
  currentUserName,
}: AdminChatClientProps) {
  const [rooms, setRooms] = useState<ChatRoomItem[]>(initialRooms);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 채팅방 목록 Realtime 업데이트 (부분 갱신)
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('admin_chat_rooms')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const msgRoomId = payload.new.room_id as string;
          const msgContent = payload.new.content as string;
          const msgCreatedAt = payload.new.created_at as string;
          const isCurrentRoom = selectedRoom?.id === msgRoomId;

          setRooms((prev) => {
            const updated = prev.map((r) =>
              r.id === msgRoomId
                ? {
                    ...r,
                    last_message: msgContent,
                    last_message_at: msgCreatedAt,
                    unread_count: isCurrentRoom ? r.unread_count : r.unread_count + 1,
                  }
                : r
            );
            return updated.sort(
              (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            );
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_rooms',
        },
        async () => {
          const result = await getChatRoomList();
          if (result.data) {
            setRooms(result.data);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoom?.id]);

  // 채팅방 선택 시 메시지 로드 (최근 50개)
  const handleSelectRoom = async (room: ChatRoomItem) => {
    setSelectedRoom(room);
    setIsLoadingMessages(true);

    try {
      const result = await getChatMessages(room.id, 50);
      if (result.data) {
        setMessages(result.data);
        setMessagesHasMore(result.hasMore ?? false);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }

    // 읽음 처리 후 해당 방의 unread만 0으로 갱신
    setRooms((prev) =>
      prev.map((r) => r.id === room.id ? { ...r, unread_count: 0 } : r)
    );
  };

  // 채팅방 목록으로 돌아가기
  const handleBack = () => {
    setSelectedRoom(null);
    setMessages([]);
  };

  // 시간 포맷팅
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return format(date, 'a h:mm', { locale: ko });
    } else if (diffDays < 7) {
      return formatDistanceToNow(date, { addSuffix: true, locale: ko });
    } else {
      return format(date, 'M월 d일', { locale: ko });
    }
  };

  // 검색어로 채팅방 필터링
  const filteredRooms = searchQuery.trim()
    ? rooms.filter((room) =>
        room.student_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : rooms;

  // 모바일에서는 목록/채팅 분리, PC에서는 나란히 표시
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text">채팅 관리</h1>
        <p className="text-text-muted mt-1">학생 · 학부모와 실시간 소통</p>
      </div>

      <div className="flex gap-6 h-[calc(100vh-180px)]">
        {/* 채팅방 목록 */}
        <div
          className={cn(
            'bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden',
            'w-80 flex-shrink-0 flex flex-col',
            selectedRoom && 'hidden lg:flex'
          )}
        >
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div>
              <h2 className="font-semibold text-text">채팅방 목록</h2>
              <p className="text-sm text-text-muted mt-0.5">
                {searchQuery.trim()
                  ? `${filteredRooms.length} / ${rooms.length}개의 채팅방`
                  : `${rooms.length}개의 채팅방`}
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="학생명으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors placeholder:text-text-muted/60"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted p-6">
                <MessageCircle className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-center">아직 채팅방이 없습니다</p>
                <p className="text-sm text-center mt-1">
                  학생이 채팅을 시작하면 표시됩니다
                </p>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted p-6">
                <Search className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-center">검색 결과가 없습니다</p>
                <p className="text-sm text-center mt-1">
                  다른 이름으로 검색해보세요
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredRooms.map((room) => (
                  <li key={room.id}>
                    <button
                      onClick={() => handleSelectRoom(room)}
                      className={cn(
                        'w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors',
                        selectedRoom?.id === room.id && 'bg-primary/5'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* 프로필 아이콘 */}
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-primary" />
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* 학생 이름 + 좌석번호 */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-text truncate">
                              {room.student_name}
                              {room.seat_number && (
                                <span className="text-text-muted font-normal ml-1">
                                  ({room.seat_number}번)
                                </span>
                              )}
                            </span>
                            {room.unread_count > 0 && (
                              <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 bg-secondary text-white text-xs font-medium rounded-full flex items-center justify-center">
                                {room.unread_count > 99
                                  ? '99+'
                                  : room.unread_count}
                              </span>
                            )}
                          </div>

                          {/* 마지막 메시지 */}
                          <p className="text-sm text-text-muted truncate mt-0.5">
                            {room.last_message || '새로운 채팅방'}
                          </p>

                          {/* 시간 */}
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3 text-text-muted" />
                            <span className="text-xs text-text-muted">
                              {formatTime(room.last_message_at)}
                            </span>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 채팅 영역 */}
        <div
          className={cn(
            'flex-1 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden',
            !selectedRoom && 'hidden lg:flex'
          )}
        >
          {selectedRoom ? (
            <ChatRoom
              roomId={selectedRoom.id}
              initialMessages={messages}
              initialHasMore={messagesHasMore}
              currentUserId={currentUserId}
              currentUserType="admin"
              currentUserName={currentUserName}
              title={selectedRoom.student_name}
              subtitle={
                selectedRoom.seat_number
                  ? `${selectedRoom.seat_number}번 좌석`
                  : undefined
              }
              onBack={handleBack}
              showBackButton
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <MessageCircle className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg">채팅방을 선택해주세요</p>
              <p className="text-sm mt-1">
                왼쪽 목록에서 채팅방을 선택하면 대화를 시작할 수 있습니다
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
