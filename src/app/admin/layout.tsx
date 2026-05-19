import { Sidebar } from '@/components/shared/sidebar';
import { SidebarProvider, SidebarMain } from '@/components/shared/sidebar-context';
import { createClient } from '@/lib/supabase/server';
import { getAdminUnreadChatCount } from '@/lib/actions/chat';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let branchName: string | null = null;
  let isSuperAdmin = false;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id, is_super_admin')
      .eq('id', user.id)
      .single();

    isSuperAdmin = !!profile?.is_super_admin;

    if (profile?.branch_id) {
      const { data: branch } = await supabase
        .from('branches')
        .select('name')
        .eq('id', profile.branch_id)
        .single();

      branchName = branch?.name || null;
    }
  }

  // 알림 뱃지는 chat type 제외(채팅 메뉴 뱃지가 별도 표시) — UX 분리 정책.
  const [{ count: initialUnreadChatCount }, notifResult] = await Promise.all([
    getAdminUnreadChatCount(),
    user
      ? supabase
          .from('user_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
          .neq('type', 'chat')
      : Promise.resolve({ count: 0 as number | null }),
  ]);
  const initialUnreadNotificationCount = notifResult.count ?? 0;

  return (
    <SidebarProvider>
      <div className='bg-background min-h-screen'>
        <Sidebar
          basePath='/admin'
          branchName={branchName}
          isSuperAdmin={isSuperAdmin}
          userId={user?.id}
          initialUnreadChatCount={initialUnreadChatCount}
          initialUnreadNotificationCount={initialUnreadNotificationCount}
        />
        <SidebarMain>{children}</SidebarMain>
      </div>
    </SidebarProvider>
  );
}
