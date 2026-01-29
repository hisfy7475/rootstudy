'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { User, Settings, LogOut, ChevronDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';

interface Child {
  id: string;
  name: string;
}

interface ParentHeaderProps {
  userName?: string;
  children?: Child[];
}

export function ParentHeader({ userName, children = [] }: ParentHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChildSelectorOpen, setIsChildSelectorOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL에서 childId를 읽어서 선택된 자녀 결정 (없으면 첫 번째 자녀)
  const childIdFromUrl = searchParams.get('childId');
  const selectedChildId = (childIdFromUrl && children.some(c => c.id === childIdFromUrl))
    ? childIdFromUrl
    : children[0]?.id;
  
  const selectedChild = children.find(c => c.id === selectedChildId);
  const childrenLabel = children.length > 0 ? `자녀 ${children.length}명` : '연결된 자녀 없음';

  const handleChildSelect = (childId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('childId', childId);
    router.push(`${pathname}?${params.toString()}`);
    setIsChildSelectorOpen(false);
  };

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

        <div className="flex items-center gap-2">
          {/* 자녀 선택 드롭다운 */}
          {children.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setIsChildSelectorOpen(!isChildSelectorOpen)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl transition-all',
                  'hover:bg-gray-100 border border-gray-200',
                  isChildSelectorOpen && 'bg-gray-100'
                )}
              >
                <Users className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-text max-w-[80px] truncate">
                  {selectedChild?.name || '자녀 선택'}
                </span>
                <ChevronDown className={cn(
                  'w-4 h-4 text-text-muted transition-transform',
                  isChildSelectorOpen && 'rotate-180'
                )} />
              </button>

              {/* 자녀 선택 드롭다운 메뉴 */}
              {isChildSelectorOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40"
                    onClick={() => setIsChildSelectorOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-card rounded-2xl shadow-lg border border-gray-100 py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-xs text-text-muted">자녀 선택</p>
                    </div>
                    {children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => handleChildSelect(child.id)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors w-full text-left',
                          selectedChildId === child.id && 'bg-primary/5'
                        )}
                      >
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                          selectedChildId === child.id 
                            ? 'bg-primary text-white' 
                            : 'bg-gray-100 text-text-muted'
                        )}>
                          {child.name.charAt(0)}
                        </div>
                        <span className={cn(
                          'text-sm',
                          selectedChildId === child.id ? 'text-primary font-medium' : 'text-text'
                        )}>
                          {child.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

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
      </div>
    </header>
  );
}
