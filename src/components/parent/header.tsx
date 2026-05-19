'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { User, Settings, LogOut, ChevronDown, Users, Megaphone, Bell } from 'lucide-react';
import { cn, isNativeApp } from '@/lib/utils';
import { SignOutForm } from '@/components/SignOutForm';
import { getUnreadAnnouncementCount } from '@/lib/actions/announcement';
import { getUnreadUserNotificationCount } from '@/lib/actions/notification';
import { createClient } from '@/lib/supabase/client';

interface Child {
  id: string;
  name: string;
  /** 퇴원 처리 시각. null 이면 활성 자녀. */
  withdrawnAt?: string | null;
}

interface ParentHeaderProps {
  userName?: string;
  linkedChildren?: Child[];
  userId?: string;
  initialUnreadAnnouncementCount?: number;
  initialUnreadNotificationCount?: number;
}

export function ParentHeader({
  userName,
  linkedChildren: children = [],
  userId,
  initialUnreadAnnouncementCount = 0,
  initialUnreadNotificationCount = 0,
}: ParentHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChildSelectorOpen, setIsChildSelectorOpen] = useState(false);
  const [unreadAnnouncementCount, setUnreadAnnouncementCount] = useState(
    initialUnreadAnnouncementCount,
  );
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(
    initialUnreadNotificationCount,
  );
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // SSR 에서는 false, hydration 후 클라이언트의 navigator.userAgent 기준 값으로 자동 동기화.
  // useEffect + setState 패턴이 React 19 의 set-state-in-effect 룰에 걸리므로 외부 store 로 처리.
  const isNative = useSyncExternalStore(
    () => () => {},
    () => isNativeApp(),
    () => false,
  );

  // 알림 카운트 realtime — sidebar.tsx 패턴(setAuth 후 subscribe).
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const refetch = () => {
      void getUnreadUserNotificationCount({ excludeTypes: ['chat'] })
        .then(setUnreadNotificationCount)
        .catch((e) => console.error('[parent-header] unread notif refetch', e));
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
        .channel(`parent-header-notif-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notifications',
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

  // 공지 카운트 realtime.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const refetch = () => {
      void getUnreadAnnouncementCount()
        .then(setUnreadAnnouncementCount)
        .catch((e) => console.error('[parent-header] unread announce refetch', e));
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
        .channel(`parent-header-announce-${userId}`)
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

  // URL에서 childId를 읽어서 선택된 자녀 결정 — 활성 자녀를 우선 선택.
  const activeChildren = children.filter((c) => !c.withdrawnAt);
  const withdrawnChildren = children.filter((c) => c.withdrawnAt);
  const childIdFromUrl = searchParams.get('childId');
  const selectedChildId =
    childIdFromUrl && children.some((c) => c.id === childIdFromUrl)
      ? childIdFromUrl
      : (activeChildren[0]?.id ?? children[0]?.id);

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const childrenLabel = (() => {
    if (children.length === 0) return '연결된 자녀 없음';
    if (withdrawnChildren.length === 0) return `자녀 ${activeChildren.length}명`;
    if (activeChildren.length === 0) return `퇴원 자녀 ${withdrawnChildren.length}명`;
    return `활성 ${activeChildren.length}명 · 퇴원 ${withdrawnChildren.length}명`;
  })();

  const handleChildSelect = (childId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('childId', childId);
    router.push(`${pathname}?${params.toString()}`);
    setIsChildSelectorOpen(false);
  };

  return (
    <header
      className={cn(
        'bg-background/80 sticky top-0 z-40 border-b border-gray-100 backdrop-blur-lg',
        isNative && 'pt-safe',
      )}
    >
      <div className='mx-auto flex max-w-lg items-center justify-between px-4 py-3'>
        {/* 로고/타이틀 */}
        <Link href='/parent' className='flex items-center'>
          <Image
            src='/logo.png'
            alt='WHEVER STUDY route'
            width={120}
            height={48}
            className='object-contain'
          />
        </Link>

        <div className='flex items-center gap-2'>
          {/* 공지사항 아이콘 */}
          <Link
            href='/parent/announcements'
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
            href='/parent/notifications'
            className='relative rounded-xl p-2 transition-all hover:bg-gray-100 active:scale-90 active:bg-gray-200'
          >
            <Bell className='text-text-muted h-5 w-5' />
            {unreadNotificationCount > 0 && (
              <span className='absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white'>
                {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
              </span>
            )}
          </Link>

          {/* 자녀 선택 드롭다운 */}
          {children.length > 0 && (
            <div className='relative'>
              <button
                onClick={() => setIsChildSelectorOpen(!isChildSelectorOpen)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 transition-all',
                  'border border-gray-200 hover:bg-gray-100 active:scale-95 active:bg-gray-200',
                  isChildSelectorOpen && 'bg-gray-100',
                )}
              >
                <Users className='text-primary h-4 w-4' />
                <span className='text-text max-w-[80px] truncate text-sm font-medium'>
                  {selectedChild?.name || '자녀 선택'}
                </span>
                {selectedChild?.withdrawnAt && (
                  <span className='rounded bg-gray-200 px-1 text-[10px] font-medium text-gray-700'>
                    퇴원
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    'text-text-muted h-4 w-4 transition-transform',
                    isChildSelectorOpen && 'rotate-180',
                  )}
                />
              </button>

              {/* 자녀 선택 드롭다운 메뉴 */}
              {isChildSelectorOpen && (
                <>
                  <div
                    className='fixed inset-0 z-40'
                    onClick={() => setIsChildSelectorOpen(false)}
                  />
                  <div className='bg-card absolute top-full right-0 z-50 mt-2 w-48 rounded-2xl border border-gray-100 py-2 shadow-lg'>
                    <div className='border-b border-gray-100 px-4 py-2'>
                      <p className='text-text-muted text-xs'>자녀 선택</p>
                    </div>
                    {children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => handleChildSelect(child.id)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100',
                          selectedChildId === child.id && 'bg-primary/5',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                            selectedChildId === child.id
                              ? 'bg-primary text-white'
                              : 'text-text-muted bg-gray-100',
                          )}
                        >
                          {child.name.charAt(0)}
                        </div>
                        <span
                          className={cn(
                            'flex items-center gap-1.5 text-sm',
                            selectedChildId === child.id ? 'text-primary font-medium' : 'text-text',
                          )}
                        >
                          {child.name}
                          {child.withdrawnAt && (
                            <span className='rounded bg-gray-200 px-1 text-[10px] font-medium text-gray-700'>
                              퇴원
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

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
              <div className='bg-secondary/10 flex h-8 w-8 items-center justify-center rounded-full'>
                <User className='text-secondary h-4 w-4' />
              </div>
              {userName && (
                <div className='hidden text-left sm:block'>
                  <p className='text-text text-sm font-medium'>{userName}</p>
                  <p className='text-text-muted text-xs'>{childrenLabel}</p>
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
                    <p className='text-text-muted text-xs'>{childrenLabel}</p>
                  </div>

                  <Link
                    href='/parent/settings'
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
