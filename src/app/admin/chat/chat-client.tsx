'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatRoom } from '@/components/shared/chat';
import { ChatMessageData } from '@/components/shared/chat';
import { getChatMessages, getChatRoomList } from '@/lib/actions/chat';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle, User, Clock, ChevronRight, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

const PAGE_SIZE = 30;

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
  initialHasMore: boolean;
  currentUserId: string;
  currentUserName: string;
}

export function AdminChatClient({
  initialRooms,
  initialHasMore,
  currentUserId,
  currentUserName,
}: AdminChatClientProps) {
  const [rooms, setRooms] = useState<ChatRoomItem[]>(initialRooms);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomItem | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const sentinelRef = useRef<HTMLLIElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // 검색 debounce (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 검색어 변경 시 서버 재조회
  useEffect(() => {
    if (debouncedSearch === '' && rooms === initialRooms) return;

    let cancelled = false;
    const fetchSearchResults = async () => {
      setIsSearching(true);
      const result = await getChatRoomList({
        limit: PAGE_SIZE,
        offset: 0,
        search: debouncedSearch || undefined,
      });
      if (!cancelled && result.data) {
        setRooms(result.data);
        setHasMore(result.hasMore ?? false);
      }
      if (!cancelled) setIsSearching(false);
    };

    fetchSearchResults();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // 무한 스크롤: IntersectionObserver
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setIsLoadingMore(true);

    const result = await getChatRoomList({
      limit: PAGE_SIZE,
      offset: rooms.length,
      search: debouncedSearch || undefined,
    });

    if (result.data) {
      setRooms((prev) => [...prev, ...result.data!]);
      setHasMore(result.hasMore ?? false);
    }

    setIsLoadingMore(false);
    loadingRef.current = false;
  }, [hasMore, rooms.length, debouncedSearch]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { root: listContainerRef.current, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Realtime 업데이트
  // selectedRoomId 는 ref 로 캡처해 채널을 매 선택마다 재생성하지 않는다
  // (채널 재생성 사이의 짧은 윈도우 동안 INSERT 이벤트가 누락될 수 있음).
  const selectedRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRoomIdRef.current = selectedRoom?.id ?? null;
  }, [selectedRoom?.id]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Realtime postgres_changes 는 listener 별 RLS 평가에 access_token 이 필요하다.
    // setAuth 가 끝나기 전에 subscribe 하면 realtime.subscription 에 claims_role='anon' 으로
    // 등록되어 RLS `TO authenticated` 정책이 차단해 INSERT/UPDATE 이벤트가 도달하지 않는다.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase
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
            const isCurrentRoom = selectedRoomIdRef.current === msgRoomId;

            setRooms((prev) => {
              const updated = prev.map((r) =>
                r.id === msgRoomId
                  ? {
                      ...r,
                      last_message: msgContent,
                      last_message_at: msgCreatedAt,
                      unread_count: isCurrentRoom ? r.unread_count : r.unread_count + 1,
                    }
                  : r,
              );
              return updated.sort(
                (a, b) =>
                  new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
              );
            });
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_messages',
          },
          async () => {
            // 다른 탭/기기에서 markAsRead 가 발생하면 unread_count 가 stale 해진다.
            // 가벼운 재조회로 동기화 (페이지 첫 페이지만, 무한스크롤 영역은 유지).
            const result = await getChatRoomList({
              limit: Math.max(rooms.length, PAGE_SIZE),
              offset: 0,
              search: debouncedSearch || undefined,
            });
            if (result.data) {
              const fresh = result.data;
              setRooms((prev) =>
                prev.map((r) => {
                  const updated = fresh.find((f: ChatRoomItem) => f.id === r.id);
                  return updated ? { ...r, unread_count: updated.unread_count } : r;
                }),
              );
            }
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_rooms',
          },
          async (payload) => {
            const newRoomId = payload.new.id as string;
            const result = await getChatRoomList({ limit: 1, offset: 0, search: undefined });
            if (result.data) {
              const newRoom = result.data.find((r: ChatRoomItem) => r.id === newRoomId);
              if (newRoom) {
                setRooms((prev) => {
                  if (prev.some((r) => r.id === newRoomId)) return prev;
                  return [newRoom, ...prev];
                });
              }
            }
          },
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[AdminChat] Realtime channel error:', status, err);
          } else if (status === 'SUBSCRIBED') {
            console.info('[AdminChat] Realtime subscribed');
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // 채널 자체는 mount 1회만 생성. selectedRoom 변경은 ref 로 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, unread_count: 0 } : r)));
  };

  const handleBack = () => {
    setSelectedRoom(null);
    setMessages([]);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return format(date, 'a h:mm', { locale: ko });
    } else if (diffDays < 7) {
      return formatDistanceToNow(date, { addSuffix: true, locale: ko });
    } else {
      return format(date, 'M월 d일', { locale: ko });
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  return (
    <div className='p-6'>
      <div className='mb-6'>
        <h1 className='text-text text-2xl font-bold'>채팅 관리</h1>
        <p className='text-text-muted mt-1'>학생 · 학부모와 실시간 소통</p>
      </div>

      <div className='flex h-[calc(100vh-180px)] gap-6'>
        {/* 채팅방 목록 */}
        <div
          className={cn(
            'overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm',
            'flex w-80 flex-shrink-0 flex-col',
            selectedRoom && 'hidden lg:flex',
          )}
        >
          <div className='space-y-3 border-b border-gray-100 p-4'>
            <div>
              <h2 className='text-text font-semibold'>채팅방 목록</h2>
              <p className='text-text-muted mt-0.5 text-sm'>
                {rooms.length}개{hasMore ? '+' : ''}의 채팅방
              </p>
            </div>
            <div className='relative'>
              <Search className='text-text-muted absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <input
                type='text'
                placeholder='학생명으로 검색...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='focus:ring-primary/30 focus:border-primary/50 placeholder:text-text-muted/60 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pr-9 pl-9 text-sm transition-colors focus:ring-2 focus:outline-none'
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className='text-text-muted hover:text-text absolute top-1/2 right-3 -translate-y-1/2 transition-colors'
                >
                  <X className='h-4 w-4' />
                </button>
              )}
            </div>
          </div>

          <div ref={listContainerRef} className='flex-1 overflow-y-auto'>
            {isSearching ? (
              <div className='text-text-muted flex h-full flex-col items-center justify-center p-6'>
                <Loader2 className='mb-3 h-8 w-8 animate-spin opacity-50' />
                <p className='text-sm'>검색 중...</p>
              </div>
            ) : rooms.length === 0 ? (
              <div className='text-text-muted flex h-full flex-col items-center justify-center p-6'>
                {debouncedSearch ? (
                  <>
                    <Search className='mb-3 h-12 w-12 opacity-50' />
                    <p className='text-center'>검색 결과가 없습니다</p>
                    <p className='mt-1 text-center text-sm'>다른 이름으로 검색해보세요</p>
                  </>
                ) : (
                  <>
                    <MessageCircle className='mb-3 h-12 w-12 opacity-50' />
                    <p className='text-center'>아직 채팅방이 없습니다</p>
                    <p className='mt-1 text-center text-sm'>학생이 채팅을 시작하면 표시됩니다</p>
                  </>
                )}
              </div>
            ) : (
              <ul className='divide-y divide-gray-100'>
                {rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      onClick={() => handleSelectRoom(room)}
                      className={cn(
                        'w-full px-4 py-3 text-left transition-colors hover:bg-gray-50',
                        selectedRoom?.id === room.id && 'bg-primary/5',
                      )}
                    >
                      <div className='flex items-start gap-3'>
                        <div className='bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full'>
                          <User className='text-primary h-5 w-5' />
                        </div>

                        <div className='min-w-0 flex-1'>
                          <div className='flex items-center justify-between gap-2'>
                            <span className='text-text truncate font-medium'>
                              {room.student_name}
                              {room.seat_number && (
                                <span className='text-text-muted ml-1 font-normal'>
                                  ({room.seat_number}번)
                                </span>
                              )}
                            </span>
                            {room.unread_count > 0 && (
                              <span className='bg-secondary flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-medium text-white'>
                                {room.unread_count > 99 ? '99+' : room.unread_count}
                              </span>
                            )}
                          </div>

                          <p className='text-text-muted mt-0.5 truncate text-sm'>
                            {room.last_message || '새로운 채팅방'}
                          </p>

                          <div className='mt-1 flex items-center gap-1'>
                            <Clock className='text-text-muted h-3 w-3' />
                            <span className='text-text-muted text-xs'>
                              {formatTime(room.last_message_at)}
                            </span>
                          </div>
                        </div>

                        <ChevronRight className='text-text-muted mt-1 h-4 w-4 flex-shrink-0' />
                      </div>
                    </button>
                  </li>
                ))}
                {/* 무한 스크롤 sentinel */}
                {hasMore && (
                  <li ref={sentinelRef} className='flex justify-center py-4'>
                    {isLoadingMore && <Loader2 className='text-text-muted h-5 w-5 animate-spin' />}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* 채팅 영역 */}
        <div
          className={cn(
            'flex-1 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm',
            !selectedRoom && 'hidden lg:flex',
          )}
        >
          {selectedRoom ? (
            <ChatRoom
              roomId={selectedRoom.id}
              initialMessages={messages}
              initialHasMore={messagesHasMore}
              currentUserId={currentUserId}
              currentUserType='admin'
              currentUserName={currentUserName}
              title={selectedRoom.student_name}
              subtitle={selectedRoom.seat_number ? `${selectedRoom.seat_number}번 좌석` : undefined}
              onBack={handleBack}
              showBackButton
            />
          ) : (
            <div className='text-text-muted flex h-full flex-col items-center justify-center'>
              <MessageCircle className='mb-4 h-16 w-16 opacity-30' />
              <p className='text-lg'>채팅방을 선택해주세요</p>
              <p className='mt-1 text-sm'>
                왼쪽 목록에서 채팅방을 선택하면 대화를 시작할 수 있습니다
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
