'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  Award,
  MessageCircle,
  Calendar,
  CalendarClock,
  BarChart3,
  Settings,
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
  { href: '/schedule', label: '부재', icon: CalendarClock },
  { href: '/points', label: '상벌점', icon: Award },
  { href: '/chat', label: '채팅', icon: MessageCircle },
  { href: '/settings', label: '설정', icon: Settings },
];

// 학부모용 네비게이션 아이템
const parentNavItems: NavItem[] = [
  { href: '', label: '홈', icon: Home },
  { href: '/schedule', label: '스케줄', icon: Calendar },
  { href: '/chat', label: '채팅', icon: MessageCircle },
];

interface BottomNavProps {
  userType: 'student' | 'parent';
  basePath?: string;
}

export function BottomNav({ userType, basePath = '' }: BottomNavProps) {
  const pathname = usePathname();
  const navItems = userType === 'student' ? studentNavItems : parentNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-gray-100 shadow-lg">
      <div className="max-w-lg mx-auto px-2">
        <ul className="flex justify-around items-center">
          {navItems.map((item) => {
            const fullPath = basePath + item.href;
            const isActive = pathname === fullPath || 
              (item.href !== '' && pathname.startsWith(fullPath));
            const Icon = item.icon;

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
                  <Icon
                    className={cn(
                      'w-6 h-6 mb-1 transition-transform duration-200',
                      isActive && 'scale-110'
                    )}
                  />
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
