import { AdminMealsNewClient } from './meals-new-client';
import { requireAdminBranch } from '@/lib/auth/admin-context';
import { createClient } from '@/lib/supabase/server';

export default async function AdminMealsNewPage() {
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
  return <AdminMealsNewClient isSuperAdmin={!!ctx?.isSuperAdmin} branches={branches} />;
}
