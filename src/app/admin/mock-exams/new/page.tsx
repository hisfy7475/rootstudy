import { AdminMockExamsNewClient } from './mock-exams-new-client';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { createClient } from '@/lib/supabase/server';

export default async function AdminMockExamsNewPage() {
  const ctx = await requireAdminBranch();
  let branches: { id: string; name: string }[] = [];
  if (ctx?.isSuperAdmin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('branches')
      .select('id, name')
      .order('name', { ascending: true });
    branches = (data ?? []) as { id: string; name: string }[];
  }
  return <AdminMockExamsNewClient isSuperAdmin={!!ctx?.isSuperAdmin} branches={branches} />;
}
