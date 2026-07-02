'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SignOutForm } from '@/components/SignOutForm';
import { useSidebar } from './sidebar-context';
import { createClient } from '@/lib/supabase/client';
import { useChatBadge } from '@/lib/chat/hooks';
import { getUnreadBranchNotificationCount } from '@/lib/actions/admin';
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
  UtensilsCrossed,
  BookOpen,
  Languages,
  FileText,
  FileBarChart2,
  Inbox,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import { ChangePasswordModal } from '@/app/admin/_components/change-password-modal';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** true면 최고 관리자에게만 노출 (일반 지점 관리자에게는 숨김). */
  requireSuperAdmin?: boolean;
}

const adminNavItems: NavItem[] = [
  { href: '', label: '대시보드', icon: LayoutDashboard },
  { href: '/chat', label: '채팅 관리', icon: MessageCircle },
  { href: '/attendance', label: '출석부', icon: ClipboardList },
  { href: '/focus', label: '몰입도 관리', icon: Brain },
  { href: '/report', label: '몰입도 리포트', icon: FileBarChart2 },
  { href: '/points', label: '상벌점 관리', icon: Award },
  { href: '/members', label: '회원 관리', icon: Users },
  { href: '/student-types', label: '학생 타입', icon: GraduationCap },
  { href: '/schedules', label: '부재 스케줄', icon: CalendarClock },
  { href: '/branches', label: '지점 관리', icon: Building2, requireSuperAdmin: true },
  { href: '/date-types', label: '날짜 타입', icon: Calendar },
  { href: '/periods', label: '교시 관리', icon: Clock },
  { href: '/notifications', label: '알림 관리', icon: Bell },
  { href: '/announcements', label: '공지사항 관리', icon: Megaphone },
  { href: '/applications', label: '통합 신청내역', icon: Inbox },
  { href: '/meals', label: '급식 관리', icon: UtensilsCrossed },
  { href: '/mock-exams', label: '모의고사 관리', icon: FileText },
  { href: '/mentoring', label: '멘토링/클리닉/상담 관리', icon: BookOpen },
  { href: '/vocab/exams', label: '영단어 시험 관리', icon: Languages },
  { href: '/download', label: '데이터 다운로드', icon: Download },
];

interface SidebarProps {
  basePath?: string;
  branchName?: string | null;
  isSuperAdmin?: boolean;
  userId?: string;
  /** 일반 관리자 본인 지점. 지점 공용 알림 realtime 구독 필터(슈퍼는 null=전체). */
  branchId?: string | null;
  initialUnreadNotificationCount?: number;
}

export function Sidebar({
  basePath = '',
  branchName,
  isSuperAdmin = false,
  userId,
  branchId,
  initialUnreadNotificationCount = 0,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { collapsed, toggleCollapsed } = useSidebar();
  // 채팅 미읽음 배지는 ChatProvider(단일 채널)가 채우는 SSOT store 에서 구독한다.
  const unreadChatCount = useChatBadge();
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(
    initialUnreadNotificationCount,
  );
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  // 메뉴 노출 가시화. requireSuperAdmin 항목은 최고 관리자에게만 표시.
  const visibleNavItems = adminNavItems.filter((item) => !item.requireSuperAdmin || isSuperAdmin);

  useEffect(() => {
    setUnreadNotificationCount(initialUnreadNotificationCount);
  }, [initialUnreadNotificationCount]);

  // 지점 공용 알림(branch_notifications) 미읽음 realtime.
  // 일반 관리자는 본인 지점 필터, 슈퍼는 무필터(RLS 가 전 지점 허용). setAuth 후 subscribe.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const refetch = () => {
      void getUnreadBranchNotificationCount()
        .then(setUnreadNotificationCount)
        .catch((e) => console.error('[Sidebar] unread branch notif refetch', e));
    };

    // 모든 이벤트에서 미읽음 카운트를 갱신하고(뱃지), 신규 INSERT 에 한해
    // 확인 전까지 사라지지 않는 토스트를 띄운다. 멘토링/클리닉/상담 신청 접수만
    // branch_notifications 에 INSERT 되므로 대상 필터링은 불필요.
    const handleChange = (payload: {
      eventType: 'INSERT' | 'UPDATE' | 'DELETE';
      new: { title?: string; message?: string; link?: string | null } | null;
    }) => {
      refetch();
      if (payload.eventType !== 'INSERT' || !payload.new) return;
      const { title, message, link } = payload.new;
      toast(title ?? '새 신청이 접수되었습니다', {
        description: message,
        duration: Infinity,
        action: link ? { label: '확인하기', onClick: () => router.push(link) } : undefined,
        // 어드민 테마 컬러(파란색) 버튼으로 통일
        actionButtonStyle: { background: 'var(--color-primary)', color: '#fff' },
      });
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;
      // realtime filter 는 단일 컬럼 eq 만 지원 → 일반 관리자만 branch_id 필터, 슈퍼는 무필터.
      const changesFilter =
        !isSuperAdmin && branchId
          ? {
              event: '*' as const,
              schema: 'public',
              table: 'branch_notifications',
              filter: `branch_id=eq.${branchId}`,
            }
          : { event: '*' as const, schema: 'public', table: 'branch_notifications' };
      channel = supabase
        .channel(`admin-sidebar-branch-notif-${userId}`)
        .on('postgres_changes', changesFilter, handleChange)
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, isSuperAdmin, branchId, router]);

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
      <div className='border-b border-gray-100 p-4'>
        <Link href='/admin' className='block'>
          <Image
            src='/logo.png'
            alt='WHEVER STUDY route 관리형 독서실'
            width={160}
            height={64}
            className='object-contain'
          />
        </Link>
        <p className='text-text-muted mt-2 text-xs'>관리자</p>
        {isSuperAdmin ? (
          <div className='mt-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5'>
            <span className='text-sm font-semibold text-purple-700'>최고 관리자</span>
          </div>
        ) : (
          branchName && (
            <div className='bg-primary/10 border-primary/20 mt-2 rounded-lg border px-3 py-1.5'>
              <div className='flex items-center gap-1.5'>
                <Building2 className='text-primary h-3.5 w-3.5 flex-shrink-0' />
                <span className='text-primary text-sm font-semibold'>{branchName}</span>
              </div>
            </div>
          )
        )}
      </div>

      <nav className='flex-1 overflow-y-auto py-3'>
        <ul className='space-y-0.5 px-3'>
          {visibleNavItems.map((item) => {
            const fullPath = basePath + item.href;
            const isActive =
              pathname === fullPath || (item.href !== '' && pathname.startsWith(fullPath));
            const Icon = item.icon;
            const badgeCount =
              item.href === '/chat'
                ? unreadChatCount
                : item.href === '/notifications'
                  ? unreadNotificationCount
                  : 0;
            const showBadge = badgeCount > 0;
            return (
              <li key={item.href}>
                <Link
                  href={fullPath}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-4 py-2 transition-all duration-200',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text hover:text-primary hover:bg-gray-50',
                  )}
                >
                  <Icon className='h-5 w-5 flex-shrink-0' />
                  <span className='text-sm'>{item.label}</span>
                  {showBadge && (
                    <span className='ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs leading-none font-bold text-white'>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className='space-y-1 border-t border-gray-100 p-4'>
        <button
          type='button'
          onClick={() => setPasswordModalOpen(true)}
          className='text-text-muted hover:text-primary flex w-full items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200 hover:bg-gray-50'
        >
          <KeyRound className='h-5 w-5 flex-shrink-0' />
          <span className='text-sm'>비밀번호 변경</span>
        </button>
        <SignOutForm>
          <button
            type='submit'
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl px-4 py-3',
              'text-text-muted hover:text-error transition-all duration-200 hover:bg-gray-50',
            )}
          >
            <LogOut className='h-5 w-5 flex-shrink-0' />
            <span className='text-sm'>로그아웃</span>
          </button>
        </SignOutForm>
      </div>
    </>
  );

  return (
    <>
      {/* 모바일 햄버거 버튼 - md 미만에서만 표시 */}
      <button
        type='button'
        onClick={toggleMobile}
        className='no-print bg-card text-text fixed top-[max(1rem,var(--app-safe-top))] left-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 shadow-sm transition-colors hover:bg-gray-50 md:hidden'
        aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
      >
        {mobileOpen ? <X className='h-5 w-5' /> : <Menu className='h-5 w-5' />}
      </button>

      {/* 모바일 오버레이 배경 */}
      {mobileOpen && (
        <div
          className='no-print fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden'
          onClick={() => setMobileOpen(false)}
          aria-hidden='true'
        />
      )}

      {/* ========== 데스크톱 사이드바 ========== */}
      <aside
        className={cn(
          'no-print bg-card fixed top-0 left-0 z-30 hidden h-screen flex-col border-r border-gray-100 shadow-sm md:flex',
          'overflow-hidden transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-[68px]' : 'w-64',
        )}
      >
        {/* 헤더 */}
        <div
          className={cn(
            'border-b border-gray-100 transition-all duration-300',
            collapsed ? 'px-2 py-3' : 'p-4',
          )}
        >
          {collapsed ? (
            <Link href='/admin' className='flex justify-center' title='대시보드'>
              <Image
                src='/logo.png'
                alt='관리자'
                width={36}
                height={36}
                className='object-contain'
              />
            </Link>
          ) : (
            <>
              <Link href='/admin' className='block'>
                <Image
                  src='/logo.png'
                  alt='WHEVER STUDY route 관리형 독서실'
                  width={160}
                  height={64}
                  className='object-contain'
                />
              </Link>
              <p className='text-text-muted mt-2 text-xs'>관리자</p>
              {isSuperAdmin ? (
                <div className='mt-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5'>
                  <span className='text-sm font-semibold whitespace-nowrap text-purple-700'>
                    최고 관리자
                  </span>
                </div>
              ) : (
                branchName && (
                  <div className='bg-primary/10 border-primary/20 mt-2 rounded-lg border px-3 py-1.5'>
                    <div className='flex items-center gap-1.5'>
                      <Building2 className='text-primary h-3.5 w-3.5 flex-shrink-0' />
                      <span className='text-primary text-sm font-semibold whitespace-nowrap'>
                        {branchName}
                      </span>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* 접기/펼치기 토글 버튼 */}
        <button
          type='button'
          onClick={toggleCollapsed}
          className={cn(
            'hover:text-primary mx-auto my-2 flex items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100',
            collapsed ? 'h-8 w-10' : 'h-8 w-[calc(100%-24px)]',
          )}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
        >
          {collapsed ? <ChevronsRight className='h-4 w-4' /> : <ChevronsLeft className='h-4 w-4' />}
        </button>

        {/* 네비게이션 */}
        <nav className='flex-1 overflow-x-hidden overflow-y-auto py-1'>
          <ul className={cn('space-y-0.5', collapsed ? 'px-1.5' : 'px-3')}>
            {visibleNavItems.map((item) => {
              const fullPath = basePath + item.href;
              const isActive =
                pathname === fullPath || (item.href !== '' && pathname.startsWith(fullPath));
              const Icon = item.icon;
              const badgeCount =
                item.href === '/chat'
                  ? unreadChatCount
                  : item.href === '/notifications'
                    ? unreadNotificationCount
                    : 0;
              const showBadge = badgeCount > 0;

              return (
                <li key={item.href}>
                  <Link
                    href={fullPath}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center rounded-2xl transition-all duration-200',
                      collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-4 py-2',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text hover:text-primary hover:bg-gray-50',
                    )}
                  >
                    <div className='relative flex-shrink-0'>
                      <Icon className='h-5 w-5' />
                      {showBadge && collapsed && (
                        <span className='absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] leading-none font-bold text-white'>
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </div>
                    {!collapsed && (
                      <>
                        <span className='text-sm whitespace-nowrap'>{item.label}</span>
                        {showBadge && (
                          <span className='ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs leading-none font-bold text-white'>
                            {badgeCount > 99 ? '99+' : badgeCount}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 하단: 비밀번호 변경 + 로그아웃 */}
        <div className={cn('space-y-1 border-t border-gray-100', collapsed ? 'p-1.5' : 'p-4')}>
          <button
            type='button'
            onClick={() => setPasswordModalOpen(true)}
            title={collapsed ? '비밀번호 변경' : undefined}
            className={cn(
              'flex w-full items-center rounded-2xl',
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-4 py-3',
              'text-text-muted hover:text-primary transition-all duration-200 hover:bg-gray-50',
            )}
          >
            <KeyRound className='h-5 w-5 flex-shrink-0' />
            {!collapsed && <span className='text-sm whitespace-nowrap'>비밀번호 변경</span>}
          </button>
          <SignOutForm>
            <button
              type='submit'
              title={collapsed ? '로그아웃' : undefined}
              className={cn(
                'flex w-full items-center rounded-2xl',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-4 py-3',
                'text-text-muted hover:text-error transition-all duration-200 hover:bg-gray-50',
              )}
            >
              <LogOut className='h-5 w-5 flex-shrink-0' />
              {!collapsed && <span className='text-sm whitespace-nowrap'>로그아웃</span>}
            </button>
          </SignOutForm>
        </div>
      </aside>

      {/* ========== 모바일 사이드바 드로어 ========== */}
      <aside
        className={cn(
          'no-print bg-card fixed top-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-gray-100 shadow-lg md:hidden',
          'transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {mobileSidebarContent}
      </aside>

      {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
    </>
  );
}
