'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';
import {
  LayoutDashboard,
  Brain,
  Award,
  Users,
  Bell,
  Download,
  MessageCircle,
  LogOut,
  Building2,
  Calendar,
  GraduationCap,
  CalendarClock,
  Clock,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const adminNavItems: NavItem[] = [
  { href: '', label: '대시보드', icon: LayoutDashboard },
  { href: '/attendance', label: '출석부', icon: ClipboardList },
  { href: '/focus', label: '몰입도 관리', icon: Brain },
  { href: '/points', label: '상벌점 관리', icon: Award },
  { href: '/members', label: '회원 관리', icon: Users },
  { href: '/student-types', label: '학생 타입', icon: GraduationCap },
  { href: '/schedules', label: '부재 스케줄', icon: CalendarClock },
  { href: '/branches', label: '지점 관리', icon: Building2 },
  { href: '/date-types', label: '날짜 타입', icon: Calendar },
  { href: '/periods', label: '교시 관리', icon: Clock },
  { href: '/notifications', label: '알림 관리', icon: Bell },
  { href: '/download', label: '데이터 다운로드', icon: Download },
  { href: '/chat', label: '채팅 관리', icon: MessageCircle },
];

interface SidebarProps {
  basePath?: string;
}

export function Sidebar({ basePath = '' }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-gray-100 shadow-sm flex flex-col">
      {/* 로고/타이틀 */}
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-xl font-bold text-primary">학습관리 시스템</h1>
        <p className="text-sm text-text-muted mt-1">관리자</p>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {adminNavItems.map((item) => {
            const fullPath = basePath + item.href;
            const isActive = pathname === fullPath ||
              (item.href !== '' && pathname.startsWith(fullPath));
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={fullPath}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text hover:bg-gray-50 hover:text-primary'
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 하단 로그아웃 */}
      <div className="p-4 border-t border-gray-100">
        <form action={signOut}>
          <button
            type="submit"
            className={cn(
              'flex items-center gap-3 w-full px-4 py-3 rounded-2xl',
              'text-text-muted hover:bg-gray-50 hover:text-error transition-all duration-200'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">로그아웃</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
