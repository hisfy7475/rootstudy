import { Sidebar } from '@/components/shared/sidebar';
import { SidebarProvider, SidebarMain } from '@/components/shared/sidebar-context';
import { createClient } from '@/lib/supabase/server';
import { getAdminUnreadChatCount } from '@/lib/actions/chat';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let branchName: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', user.id)
      .single();

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
      <div className="min-h-screen bg-background">
        <Sidebar basePath="/admin" branchName={branchName} initialUnreadChatCount={initialUnreadChatCount} />
        <SidebarMain>{children}</SidebarMain>
      </div>
    </SidebarProvider>
  );
}
