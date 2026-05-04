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

  const { count: initialUnreadChatCount } = await getAdminUnreadChatCount();

  return (
    <SidebarProvider>
      <div className='bg-background min-h-screen'>
        <Sidebar
          basePath='/admin'
          branchName={branchName}
          isSuperAdmin={isSuperAdmin}
          initialUnreadChatCount={initialUnreadChatCount}
        />
        <SidebarMain>{children}</SidebarMain>
      </div>
    </SidebarProvider>
  );
}
