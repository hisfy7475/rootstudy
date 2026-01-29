'use client';

import { useState } from 'react';
import Link from 'next/link';
import { User, Settings, LogOut, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';

interface ParentHeaderProps {
  userName?: string;
  childrenCount?: number;
}

export function ParentHeader({ userName, childrenCount = 0 }: ParentHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const childrenLabel = childrenCount > 0 ? `자녀 ${childrenCount}명` : '연결된 자녀 없음';

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-gray-100">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        {/* 로고/타이틀 */}
        <Link href="/parent" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <span className="font-bold text-text">Study Cafe</span>
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
            <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-secondary" />
            </div>
            {userName && (
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-text">{userName}</p>
                <p className="text-xs text-text-muted">{childrenLabel}</p>
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
                  <p className="text-xs text-text-muted">{childrenLabel}</p>
                </div>
                
                <Link
                  href="/parent/settings"
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
    </header>
  );
}
