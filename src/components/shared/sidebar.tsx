'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';
import { useSidebar } from './sidebar-context';
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
  Megaphone,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
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
  { href: '/announcements', label: '공지사항 관리', icon: Megaphone },
  { href: '/download', label: '데이터 다운로드', icon: Download },
  { href: '/chat', label: '채팅 관리', icon: MessageCircle },
];

interface SidebarProps {
  basePath?: string;
  branchName?: string | null;
}

export function Sidebar({ basePath = '', branchName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggleCollapsed } = useSidebar();

  // 경로 변경 시 모바일 메뉴 닫기
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // ESC 키로 모바일 메뉴 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    if (mobileOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  // 모바일용 사이드바 콘텐츠 (항상 펼침)
  const mobileSidebarContent = (
    <>
      <div className="p-4 border-b border-gray-100">
        <Link href="/admin" className="block">
          <Image
            src="/logo.png"
            alt="WHEVER STUDY route 관리형 독서실"
            width={160}
            height={64}
            className="object-contain"
          />
        </Link>
        <p className="text-xs text-text-muted mt-2">관리자</p>
        {branchName && (
          <div className="mt-2 px-3 py-1.5 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-sm font-semibold text-primary">{branchName}</span>
            </div>
          </div>
        )}
      </div>

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
    </>
  );

  return (
    <>
      {/* 모바일 햄버거 버튼 - md 미만에서만 표시 */}
      <button
        type="button"
        onClick={toggleMobile}
        className="fixed top-4 left-4 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-gray-200 shadow-sm text-text hover:bg-gray-50 transition-colors"
        aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* 모바일 오버레이 배경 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ========== 데스크톱 사이드바 ========== */}
      <aside
        className={cn(
          'hidden md:flex fixed left-0 top-0 h-screen bg-card border-r border-gray-100 shadow-sm flex-col z-30',
          'transition-[width] duration-300 ease-in-out overflow-hidden',
          collapsed ? 'w-[68px]' : 'w-64'
        )}
      >
        {/* 헤더 */}
        <div className={cn(
          'border-b border-gray-100 transition-all duration-300',
          collapsed ? 'px-2 py-3' : 'p-4'
        )}>
          {collapsed ? (
            <Link href="/admin" className="flex justify-center" title="대시보드">
              <Image
                src="/logo.png"
                alt="관리자"
                width={36}
                height={36}
                className="object-contain"
              />
            </Link>
          ) : (
            <>
              <Link href="/admin" className="block">
                <Image
                  src="/logo.png"
                  alt="WHEVER STUDY route 관리형 독서실"
                  width={160}
                  height={64}
                  className="object-contain"
                />
              </Link>
              <p className="text-xs text-text-muted mt-2">관리자</p>
              {branchName && (
                <div className="mt-2 px-3 py-1.5 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span className="text-sm font-semibold text-primary whitespace-nowrap">{branchName}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 접기/펼치기 토글 버튼 */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            'flex items-center justify-center mx-auto my-2 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 transition-colors',
            collapsed ? 'w-10 h-8' : 'w-[calc(100%-24px)] h-8'
          )}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
        >
          {collapsed ? (
            <ChevronsRight className="w-4 h-4" />
          ) : (
            <ChevronsLeft className="w-4 h-4" />
          )}
        </button>

        {/* 네비게이션 */}
        <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden">
          <ul className={cn('space-y-1', collapsed ? 'px-1.5' : 'px-3')}>
            {adminNavItems.map((item) => {
              const fullPath = basePath + item.href;
              const isActive = pathname === fullPath ||
                (item.href !== '' && pathname.startsWith(fullPath));
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={fullPath}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center rounded-2xl transition-all duration-200',
                      collapsed
                        ? 'justify-center px-0 py-2.5'
                        : 'gap-3 px-4 py-3',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text hover:bg-gray-50 hover:text-primary'
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && (
                      <span className="text-sm whitespace-nowrap">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 하단 로그아웃 */}
        <div className={cn(
          'border-t border-gray-100',
          collapsed ? 'p-1.5' : 'p-4'
        )}>
          <form action={signOut}>
            <button
              type="submit"
              title={collapsed ? '로그아웃' : undefined}
              className={cn(
                'flex items-center rounded-2xl w-full',
                collapsed
                  ? 'justify-center px-0 py-2.5'
                  : 'gap-3 px-4 py-3',
                'text-text-muted hover:bg-gray-50 hover:text-error transition-all duration-200'
              )}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm whitespace-nowrap">로그아웃</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* ========== 모바일 사이드바 드로어 ========== */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 bg-card border-r border-gray-100 shadow-lg flex flex-col z-50 md:hidden',
          'transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {mobileSidebarContent}
      </aside>
    </>
  );
}
