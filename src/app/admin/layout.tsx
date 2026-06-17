import { Sidebar } from '@/components/shared/sidebar';
import { SidebarProvider, SidebarMain } from '@/components/shared/sidebar-context';
import { ChatProvider } from '@/lib/chat/provider';
import { createClient } from '@/lib/supabase/server';
import { getAdminUnreadChatCount } from '@/lib/actions/chat';
import { getUnreadBranchNotificationCount } from '@/lib/actions/admin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let branchName: string | null = null;
  let branchId: string | null = null;
  let isSuperAdmin = false;
  let userName: string | undefined;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id, is_super_admin, name')
      .eq('id', user.id)
      .single();

    isSuperAdmin = !!profile?.is_super_admin;
    branchId = profile?.branch_id ?? null;
    userName = profile?.name ?? undefined;

    if (profile?.branch_id) {
      const { data: branch } = await supabase
        .from('branches')
        .select('name')
        .eq('id', profile.branch_id)
        .single();

      branchName = branch?.name || null;
    }
  }

  // 알림 뱃지 = 지점 공용 알림(멘토링/상담 접수 등) 미읽음. 채팅 뱃지는 별도(getAdminUnreadChatCount).
  const [{ count: initialUnreadChatCount }, initialUnreadNotificationCount] = await Promise.all([
    getAdminUnreadChatCount(),
    user ? getUnreadBranchNotificationCount() : Promise.resolve(0),
  ]);

  return (
    <SidebarProvider>
      <ChatProvider
        currentUserId={user?.id ?? ''}
        scope='admin'
        currentUserName={userName}
        initialBadge={initialUnreadChatCount}
      >
        <div className='bg-background min-h-screen'>
          <Sidebar
            basePath='/admin'
            branchName={branchName}
            isSuperAdmin={isSuperAdmin}
            userId={user?.id}
            branchId={branchId}
            initialUnreadNotificationCount={initialUnreadNotificationCount}
          />
          <SidebarMain>{children}</SidebarMain>
        </div>
      </ChatProvider>
    </SidebarProvider>
  );
}
