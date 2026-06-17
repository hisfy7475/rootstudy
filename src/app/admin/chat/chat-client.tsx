'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatRoom } from '@/components/shared/chat';
import { ChatMessageData } from '@/components/shared/chat';
import { SearchInput } from '@/components/ui/search-input';
import { getChatMessages, getChatRoomList } from '@/lib/actions/chat';
import { createClient } from '@/lib/supabase/client';
import { MessageCircle, User, Clock, ChevronRight, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

const PAGE_SIZE = 30;

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

interface AdminChatClientProps {
  initialRooms: ChatRoomItem[];
  initialHasMore: boolean;
  currentUserId: string;
  currentUserName: string;
  initialSelectedRoom?: ChatRoomItem | null;
  initialSelectedMessages?: ChatMessageData[];
  initialSelectedHasMore?: boolean;
}

export function AdminChatClient({
  initialRooms,
  initialHasMore,
  currentUserId,
  currentUserName,
  initialSelectedRoom = null,
  initialSelectedMessages = [],
  initialSelectedHasMore = false,
}: AdminChatClientProps) {
  const searchParams = useSearchParams();
  const urlStudentId = searchParams.get('studentId');

  // 첫 30개에 없는 방을 SSR이 prepend 한 경우 좌측에서도 즉시 보이게 한다.
  const [rooms, setRooms] = useState<ChatRoomItem[]>(() => {
    if (initialSelectedRoom && !initialRooms.some((r) => r.id === initialSelectedRoom.id)) {
      return [initialSelectedRoom, ...initialRooms];
    }
    return initialRooms;
  });
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoomItem | null>(initialSelectedRoom);
  const [messages, setMessages] = useState<ChatMessageData[]>(initialSelectedMessages);
  const [messagesHasMore, setMessagesHasMore] = useState(initialSelectedHasMore);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const sentinelRef = useRef<HTMLLIElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  // 사용자가 검색을 실제로 트리거했는지 추적 (prepend 등으로 reference 비교가 깨질 수 있어 ref 로 명시).
  const searchTouchedRef = useRef(false);

  // 검색어 확정 시 서버 재조회 (Enter / 돋보기 버튼 / X 클리어 트리거)
  useEffect(() => {
    if (!searchTouchedRef.current) return;

    let cancelled = false;
    const fetchSearchResults = async () => {
      setIsSearching(true);
      const result = await getChatRoomList({
        limit: PAGE_SIZE,
        offset: 0,
        search: appliedSearch || undefined,
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
  }, [appliedSearch]);

  // 무한 스크롤: IntersectionObserver
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setIsLoadingMore(true);

    const result = await getChatRoomList({
      limit: PAGE_SIZE,
      offset: rooms.length,
      search: appliedSearch || undefined,
    });

    if (result.data) {
      // pinnedRoom prepend 로 동일 id 가 페이지에 다시 들어올 수 있어 dedup.
      const fresh = result.data;
      setRooms((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...fresh.filter((r: ChatRoomItem) => !ids.has(r.id))];
      });
      setHasMore(result.hasMore ?? false);
    }

    setIsLoadingMore(false);
    loadingRef.current = false;
  }, [hasMore, rooms.length, appliedSearch]);

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
  // 채널 useEffect 는 mount 1회만 실행되고 핸들러가 클로저로 캡처되므로,
  // 핸들러 내부에서 참조하는 값은 모두 ref 화해 stale 을 방지한다.
  // (selectedRoomId — 현재 보는 방 / roomsCount — 무한스크롤 누적 개수 /
  // appliedSearch — 검색 컨텍스트)
  const selectedRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRoomIdRef.current = selectedRoom?.id ?? null;
  }, [selectedRoom?.id]);

  const roomsCountRef = useRef(rooms.length);
  useEffect(() => {
    roomsCountRef.current = rooms.length;
  }, [rooms.length]);

  const appliedSearchRef = useRef(appliedSearch);
  useEffect(() => {
    appliedSearchRef.current = appliedSearch;
  }, [appliedSearch]);

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
            // 가벼운 재조회로 동기화 — 무한스크롤 누적 개수와 현재 검색어를 모두 ref 로
            // 읽어 최신 컨텍스트로 첫 페이지(최대 누적 개수만큼) 재조회.
            const result = await getChatRoomList({
              limit: Math.max(roomsCountRef.current, PAGE_SIZE),
              offset: 0,
              search: appliedSearchRef.current || undefined,
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
    // 채널 자체는 mount 1회만 생성. 핸들러가 참조하는 모든 값은 ref 로 캡처.
  }, []);

  const handleSelectRoom = useCallback(
    async (room: ChatRoomItem) => {
      // URL 을 SSoT 로 유지하되 RSC 재fetch 와 history 누적을 모두 피하기 위해
      // 네이티브 History API 를 직접 사용한다 (Next.js 가 useSearchParams 를 동기화).
      // router.replace 는 Next.js 16 + Turbopack 환경에서 searchParams 변경 시
      // history entry 가 누적되는 거동을 보여 채택하지 않는다.
      if (urlStudentId !== room.student_id) {
        window.history.replaceState(null, '', `/admin/chat?studentId=${room.student_id}`);
      }

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
    },
    [urlStudentId],
  );

  const handleBack = () => {
    // URL 을 비우면 아래 동기화 effect 가 selectedRoom/messages 를 정리한다.
    window.history.replaceState(null, '', '/admin/chat');
    setSelectedRoom(null);
    setMessages([]);
    setMessagesHasMore(false);
  };

  // URL → 상태 동기화 (브라우저 뒤로/앞으로, 외부 진입, 좌측 클릭 모두 같은 경로로 흡수)
  // 마운트 시 SSR 이 채운 selectedRoom 과 URL 이 같으면 재fetch 하지 않는다.
  const initialUrlStudentIdRef = useRef(initialSelectedRoom?.student_id ?? null);
  useEffect(() => {
    if (urlStudentId === initialUrlStudentIdRef.current) {
      // 첫 1회는 SSR 값을 그대로 사용하고, 이후 사이클부터는 정상 동기화.
      initialUrlStudentIdRef.current = '__consumed__';
      return;
    }

    if (!urlStudentId) {
      setSelectedRoom(null);
      setMessages([]);
      setMessagesHasMore(false);
      return;
    }

    // 이미 보고 있는 방이면 no-op.
    if (selectedRoom?.student_id === urlStudentId) return;

    const target = rooms.find((r) => r.student_id === urlStudentId);
    if (target) {
      void handleSelectRoom(target);
      return;
    }

    // 좌측 첫 페이지에 없는 방 — 단일 조회 후 prepend + 선택.
    let cancelled = false;
    (async () => {
      const single = await getChatRoomList({ studentId: urlStudentId, limit: 1 });
      if (cancelled) return;
      const room = single.data?.[0];
      if (room) {
        setRooms((prev) => (prev.some((r) => r.id === room.id) ? prev : [room, ...prev]));
        void handleSelectRoom(room);
      }
    })();
    return () => {
      cancelled = true;
    };
    // selectedRoom 은 effect 내부에서만 비교용으로 읽으므로 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStudentId, handleSelectRoom]);

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
            <SearchInput
              mode='controlled'
              value={appliedSearch}
              onSubmit={(v) => {
                searchTouchedRef.current = true;
                setAppliedSearch(v);
              }}
              onClear={() => {
                searchTouchedRef.current = true;
                setAppliedSearch('');
              }}
              placeholder='학생명으로 검색...'
              className='w-full max-w-none'
            />
          </div>

          <div ref={listContainerRef} className='flex-1 overflow-y-auto'>
            {isSearching ? (
              <div className='text-text-muted flex h-full flex-col items-center justify-center p-6'>
                <Loader2 className='mb-3 h-8 w-8 animate-spin opacity-50' />
                <p className='text-sm'>검색 중...</p>
              </div>
            ) : rooms.length === 0 ? (
              <div className='text-text-muted flex h-full flex-col items-center justify-center p-6'>
                {appliedSearch ? (
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
          {selectedRoom && isLoadingMessages ? (
            // 메시지 로드 완료 후에 mount 한다. useChatRoom 은 roomId 기준 1회 시드라,
            // 로딩 중(이전 방 메시지 상태)에 mount 하면 잘못된 초기 메시지로 시드된다.
            <div className='text-text-muted flex h-full w-full items-center justify-center'>
              <Loader2 className='h-8 w-8 animate-spin opacity-50' />
            </div>
          ) : selectedRoom ? (
            <ChatRoom
              key={selectedRoom.id}
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
            <div className='text-text-muted flex h-full w-full flex-col items-center justify-center'>
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
