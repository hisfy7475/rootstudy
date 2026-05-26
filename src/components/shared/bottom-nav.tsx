'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { getStudentUnreadChatCount, getParentUnreadChatCount } from '@/lib/actions/chat';
import {
  Home,
  MessageCircle,
  CalendarClock,
  BarChart3,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// 학생: 홈 · 스케줄 · 통계 · 채팅 · 더보기(멘토링·급식·리포트·상벌점 등)
const studentNavItems: NavItem[] = [
  { href: '', label: '홈', icon: Home },
  { href: '/schedule', label: '스케줄', icon: CalendarClock },
  { href: '/stats', label: '통계', icon: BarChart3 },
  { href: '/chat', label: '채팅', icon: MessageCircle },
  { href: '/more', label: '더보기', icon: LayoutGrid },
];

const studentMorePathPrefixes = [
  '/more',
  '/mentoring',
  '/order',
  '/meals',
  '/mock-exams',
  '/report',
  '/points',
  '/announcements',
  '/notifications',
  '/settings',
  '/focus',
  '/subject',
];

// 학부모: 홈 · 스케줄 · 채팅 · 더보기(멘토링·급식·리포트·설정 등)
const parentNavItems: NavItem[] = [
  { href: '', label: '홈', icon: Home },
  { href: '/schedule', label: '스케줄', icon: CalendarClock },
  { href: '/chat', label: '채팅', icon: MessageCircle },
  { href: '/more', label: '더보기', icon: LayoutGrid },
];

const parentMorePathPrefixes = [
  '/more',
  '/mentoring',
  '/order',
  '/meals',
  '/mock-exams',
  '/report',
  '/settings',
  '/announcements',
  '/notifications',
];

interface BottomNavProps {
  userType: 'student' | 'parent';
  basePath?: string;
  initialUnreadChatCount?: number;
}

export function BottomNav({ userType, basePath = '', initialUnreadChatCount = 0 }: BottomNavProps) {
  const pathname = usePathname();
  const navItems = userType === 'student' ? studentNavItems : parentNavItems;
  const [unreadChatCount, setUnreadChatCount] = useState(initialUnreadChatCount);
  const navRef = useRef<HTMLElement>(null);

  // 하단 탭 실제 높이를 --app-bottom-nav-height 로 publish.
  // pb-safe + 콘텐츠 패딩이 디바이스마다 다르므로 측정값 기준이 안전.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty('--app-bottom-nav-height', `${el.offsetHeight}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--app-bottom-nav-height');
    };
  }, []);

  useEffect(() => {
    setUnreadChatCount(initialUnreadChatCount);
  }, [initialUnreadChatCount]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchUnreadCount = async () => {
      const { count } =
        userType === 'student'
          ? await getStudentUnreadChatCount()
          : await getParentUnreadChatCount();
      if (!cancelled) setUnreadChatCount(count);
    };

    // 채널명에 userId 를 포함해 단말 내 계정 전환/멀티 컴포넌트 cleanup 충돌을 방지.
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      const channelName = `bottom-nav-chat-unread-${user?.id ?? 'anon'}-${userType}`;
      channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
          fetchUnreadCount();
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userType]);

  return (
    <nav
      ref={navRef}
      className='app-bottom-nav bg-card pb-safe fixed right-0 bottom-0 left-0 z-50 border-t border-gray-100 shadow-lg'
    >
      <div className='mx-auto max-w-lg px-2'>
        <ul className='flex items-center justify-around'>
          {navItems.map((item) => {
            const fullPath = basePath + item.href;
            const isMoreTab =
              item.href === '/more' &&
              (userType === 'student'
                ? studentMorePathPrefixes.some((p) => pathname.startsWith(basePath + p))
                : parentMorePathPrefixes.some((p) => pathname.startsWith(basePath + p)));
            const isActive =
              isMoreTab ||
              pathname === fullPath ||
              (item.href !== '' && item.href !== '/more' && pathname.startsWith(fullPath));
            const Icon = item.icon;
            const isChatItem = item.href === '/chat';
            const showBadge = isChatItem && unreadChatCount > 0;

            return (
              <li key={item.href}>
                <Link
                  href={fullPath}
                  className={cn(
                    'flex flex-col items-center px-3 py-3 transition-all duration-200',
                    'min-w-[60px]',
                    'active:scale-90 active:opacity-60',
                    isActive ? 'text-primary' : 'text-text-muted hover:text-text',
                  )}
                >
                  <div className='relative mb-1'>
                    <Icon
                      className={cn(
                        'h-6 w-6 transition-transform duration-200',
                        isActive && 'scale-110',
                      )}
                    />
                    {showBadge && (
                      <span className='absolute -top-1.5 -right-2 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] leading-none font-bold text-white'>
                        {unreadChatCount > 99 ? '99+' : unreadChatCount}
                      </span>
                    )}
                  </div>
                  <span className={cn('text-xs font-medium', isActive && 'font-semibold')}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
