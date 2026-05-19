'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { User, Settings, LogOut, ChevronDown, Bell, Megaphone } from 'lucide-react';
import { cn, isNativeApp } from '@/lib/utils';
import { SignOutForm } from '@/components/SignOutForm';
import { getUnreadNotificationCount } from '@/lib/actions/notification';
import { getUnreadAnnouncementCount } from '@/lib/actions/announcement';
import { createClient } from '@/lib/supabase/client';

interface StudentHeaderProps {
  userName?: string;
  seatNumber?: number;
  userId?: string;
  initialUnreadCount?: number;
  initialUnreadAnnouncementCount?: number;
}

export function StudentHeader({
  userName,
  seatNumber,
  userId,
  initialUnreadCount = 0,
  initialUnreadAnnouncementCount = 0,
}: StudentHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [unreadAnnouncementCount, setUnreadAnnouncementCount] = useState(
    initialUnreadAnnouncementCount,
  );
  // SSR 에서는 false, hydration 후 클라이언트의 navigator.userAgent 기준 값으로 자동 동기화.
  // useEffect + setState 패턴이 React 19 의 set-state-in-effect 룰에 걸리므로 외부 store 로 처리.
  const isNative = useSyncExternalStore(
    () => () => {},
    () => isNativeApp(),
    () => false,
  );
  const headerRef = useRef<HTMLElement>(null);

  // 헤더 실제 높이를 --app-header-height 로 publish.
  // 이름·뱃지 등으로 줄바꿈이 생겨 키가 커져도 ResizeObserver 가 재발행해
  // 채팅 wrapper 같은 의존 화면이 자동 보정된다.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty('--app-header-height', `${el.offsetHeight}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--app-header-height');
    };
  }, []);

  // 알림 카운트 realtime — 페이지 표시와 일관되게 모든 type 포함.
  // sidebar.tsx 패턴 — session 을 await + setAuth 한 뒤 subscribe 해야 realtime listener 가
  // 'authenticated' 로 등록되어 RLS SELECT 가 통과되고 postgres_changes 이벤트가 도달한다.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const refetch = () => {
      void getUnreadNotificationCount({ excludeTypes: ['chat'] })
        .then(setUnreadCount)
        .catch((e) => console.error('[student-header] unread notif refetch', e));
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;
      channel = supabase
        .channel(`student-header-notif-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'student_notifications',
            filter: `student_id=eq.${userId}`,
          },
          refetch,
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  // 공지 카운트 realtime (announcements INSERT + announcement_reads 읽음 처리).
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const refetch = () => {
      void getUnreadAnnouncementCount()
        .then(setUnreadAnnouncementCount)
        .catch((e) => console.error('[student-header] unread announce refetch', e));
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;
      channel = supabase
        .channel(`student-header-announce-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, refetch)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'announcement_reads',
            filter: `user_id=eq.${userId}`,
          },
          refetch,
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <header
      ref={headerRef}
      className={cn(
        'bg-background/80 sticky top-0 z-40 border-b border-gray-100 backdrop-blur-lg',
        isNative && 'pt-safe',
      )}
    >
      <div className='mx-auto flex max-w-lg items-center justify-between px-4 py-3'>
        {/* 로고/타이틀 */}
        <Link href='/student' className='flex items-center'>
          <Image
            src='/logo.png'
            alt='WHEVER STUDY route'
            width={120}
            height={48}
            className='object-contain'
          />
        </Link>

        {/* 공지/알림 아이콘 & 프로필 드롭다운 */}
        <div className='flex items-center gap-2'>
          {/* 공지사항 아이콘 */}
          <Link
            href='/student/announcements'
            className='relative rounded-xl p-2 transition-all hover:bg-gray-100 active:scale-90 active:bg-gray-200'
          >
            <Megaphone className='text-text-muted h-5 w-5' />
            {unreadAnnouncementCount > 0 && (
              <span className='bg-primary absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-xs font-bold text-white'>
                {unreadAnnouncementCount > 99 ? '99+' : unreadAnnouncementCount}
              </span>
            )}
          </Link>

          {/* 알림 아이콘 */}
          <Link
            href='/student/notifications'
            className='relative rounded-xl p-2 transition-all hover:bg-gray-100 active:scale-90 active:bg-gray-200'
          >
            <Bell className='text-text-muted h-5 w-5' />
            {unreadCount > 0 && (
              <span className='absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white'>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          {/* 프로필 드롭다운 */}
          <div className='relative'>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 transition-all',
                'hover:bg-gray-100 active:scale-95 active:bg-gray-200',
                isMenuOpen && 'bg-gray-100',
              )}
            >
              <div className='bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full'>
                <User className='text-primary h-4 w-4' />
              </div>
              {userName && (
                <div className='hidden text-left sm:block'>
                  <p className='text-text text-sm font-medium'>{userName}</p>
                  {seatNumber != null && (
                    <p className='text-text-muted text-xs'>좌석 {seatNumber}</p>
                  )}
                </div>
              )}
              <ChevronDown
                className={cn(
                  'text-text-muted h-4 w-4 transition-transform',
                  isMenuOpen && 'rotate-180',
                )}
              />
            </button>

            {/* 드롭다운 메뉴 */}
            {isMenuOpen && (
              <>
                {/* 오버레이 */}
                <div className='fixed inset-0 z-40' onClick={() => setIsMenuOpen(false)} />

                {/* 메뉴 */}
                <div className='bg-card absolute top-full right-0 z-50 mt-2 w-48 rounded-2xl border border-gray-100 py-2 shadow-lg'>
                  <div className='border-b border-gray-100 px-4 py-2 sm:hidden'>
                    <p className='text-text font-medium'>{userName || '사용자'}</p>
                    {seatNumber != null && (
                      <p className='text-text-muted mt-0.5 text-xs'>좌석 {seatNumber}</p>
                    )}
                  </div>

                  <Link
                    href='/student/settings'
                    onClick={() => setIsMenuOpen(false)}
                    className='flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50 active:bg-gray-100'
                  >
                    <Settings className='text-text-muted h-4 w-4' />
                    <span className='text-text text-sm'>설정</span>
                  </Link>

                  <SignOutForm>
                    <button
                      type='submit'
                      className='flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100'
                    >
                      <LogOut className='h-4 w-4 text-red-500' />
                      <span className='text-sm text-red-500'>로그아웃</span>
                    </button>
                  </SignOutForm>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
