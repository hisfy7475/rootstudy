'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { User, Settings, LogOut, ChevronDown, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';
import { getUnreadNotificationCount } from '@/lib/actions/notification';

interface StudentHeaderProps {
  userName?: string;
  seatNumber?: number;
  initialUnreadCount?: number;
}

export function StudentHeader({ userName, seatNumber, initialUnreadCount = 0 }: StudentHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  // 주기적으로 읽지 않은 알림 수 갱신 (30초마다)
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const count = await getUnreadNotificationCount();
        setUnreadCount(count);
      } catch (error) {
        console.error('Failed to fetch unread count:', error);
      }
    };

    // 초기 로드
    if (initialUnreadCount === 0) {
      fetchUnreadCount();
    }

    // 주기적 갱신
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [initialUnreadCount]);

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-gray-100">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        {/* 로고/타이틀 */}
        <Link href="/student" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="font-bold text-text">Study Cafe</span>
        </Link>

        {/* 알림 아이콘 & 프로필 드롭다운 */}
        <div className="flex items-center gap-2">
          {/* 알림 아이콘 */}
          <Link
            href="/student/notifications"
            className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5 text-text-muted" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>

          {/* 프로필 드롭다운 */}
          <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl transition-all',
              'hover:bg-gray-100',
              isMenuOpen && 'bg-gray-100'
            )}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            {userName && (
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-text">{userName}</p>
                {seatNumber && (
                  <p className="text-xs text-text-muted">{seatNumber}번 좌석</p>
                )}
              </div>
            )}
            <ChevronDown className={cn(
              'w-4 h-4 text-text-muted transition-transform',
              isMenuOpen && 'rotate-180'
            )} />
          </button>

          {/* 드롭다운 메뉴 */}
          {isMenuOpen && (
            <>
              {/* 오버레이 */}
              <div 
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
              />
              
              {/* 메뉴 */}
              <div className="absolute right-0 top-full mt-2 w-48 bg-card rounded-2xl shadow-lg border border-gray-100 py-2 z-50">
                <div className="px-4 py-2 border-b border-gray-100 sm:hidden">
                  <p className="font-medium text-text">{userName || '사용자'}</p>
                  {seatNumber && (
                    <p className="text-xs text-text-muted">{seatNumber}번 좌석</p>
                  )}
                </div>
                
                <Link
                  href="/student/settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-text-muted" />
                  <span className="text-sm text-text">설정</span>
                </Link>
                
                <form action={signOut}>
                  <button
                    type="submit"
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors w-full text-left"
                  >
                    <LogOut className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-500">로그아웃</span>
                  </button>
                </form>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </header>
  );
}
