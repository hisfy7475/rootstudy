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
        'min-h-screen transition-[margin-left] duration-300',
        collapsed ? 'md:ml-[68px]' : 'md:ml-64'
      )}
    >
      {children}
    </main>
  );
}
