'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SidebarContextType {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  toggleCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = useCallback(() => setCollapsed((prev) => !prev), []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

/** 사이드바 collapsed 상태에 따라 margin-left가 변하는 main 래퍼 */
export function SidebarMain({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <main
      className={cn(
        // 모바일: 고정 햄버거 버튼(top-4 left-4, h-10)이 페이지 상단을 가리므로 pt-16 로 여백 확보.
        // 데스크톱(md:)은 사이드바가 있어 불필요 → md:pt-0.
        // 주의: 100vh 기반 고정 높이 콘텐츠는 이 64px 를 높이 계산에서 빼야 함(예: admin/chat).
        'min-h-screen pt-16 transition-[margin-left] duration-300 md:pt-0',
        collapsed ? 'md:ml-[68px]' : 'md:ml-64'
      )}
    >
      {children}
    </main>
  );
}
