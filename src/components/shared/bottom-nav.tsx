'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { getStudentUnreadChatCount, getParentUnreadChatCount } from '@/lib/actions/chat';
import {
  Home,
  Award,
  MessageCircle,
  Calendar,
  CalendarClock,
  BarChart3,
  FileBarChart2,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// 학생용 네비게이션 아이템
const studentNavItems: NavItem[] = [
  { href: '', label: '홈', icon: Home },
  { href: '/stats', label: '통계', icon: BarChart3 },
  { href: '/schedule', label: '스케줄', icon: CalendarClock },
  { href: '/points', label: '상벌점', icon: Award },
  { href: '/chat', label: '채팅', icon: MessageCircle },
];

// 학부모용 네비게이션 아이템
const parentNavItems: NavItem[] = [
  { href: '', label: '홈', icon: Home },
  { href: '/schedule', label: '스케줄', icon: Calendar },
  { href: '/report', label: '리포트', icon: FileBarChart2 },
  { href: '/chat', label: '채팅', icon: MessageCircle },
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

  useEffect(() => {
    setUnreadChatCount(initialUnreadChatCount);
  }, [initialUnreadChatCount]);

  useEffect(() => {
    const supabase = createClient();

    const fetchUnreadCount = async () => {
      const { count } =
        userType === 'student'
          ? await getStudentUnreadChatCount()
          : await getParentUnreadChatCount();
      setUnreadChatCount(count);
    };

    const channel = supabase
      .channel('bottom-nav-chat-unread')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        () => { fetchUnreadCount(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userType]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-gray-100 shadow-lg">
      <div className="max-w-lg mx-auto px-2">
        <ul className="flex justify-around items-center">
          {navItems.map((item) => {
            const fullPath = basePath + item.href;
            const isActive = pathname === fullPath || 
              (item.href !== '' && pathname.startsWith(fullPath));
            const Icon = item.icon;
            const isChatItem = item.href === '/chat';
            const showBadge = isChatItem && unreadChatCount > 0;

            return (
              <li key={item.href}>
                <Link
                  href={fullPath}
                  className={cn(
                    'flex flex-col items-center py-3 px-3 transition-all duration-200',
                    'min-w-[60px]',
                    isActive
                      ? 'text-primary'
                      : 'text-text-muted hover:text-text'
                  )}
                >
                  <div className="relative mb-1">
                    <Icon
                      className={cn(
                        'w-6 h-6 transition-transform duration-200',
                        isActive && 'scale-110'
                      )}
                    />
                    {showBadge && (
                      <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {unreadChatCount > 99 ? '99+' : unreadChatCount}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    'text-xs font-medium',
                    isActive && 'font-semibold'
                  )}>
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
