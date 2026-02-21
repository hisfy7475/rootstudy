import { getAllStudents } from '@/lib/actions/admin';
import { DashboardClient } from './dashboard-client';
import { createClient } from '@/lib/supabase/server';

export default async function AdminDashboard() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  let branchId: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', user.id)
      .single();
    branchId = profile?.branch_id || null;
  }

  if (!branchId) {
    const { data: firstBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    branchId = firstBranch?.id || null;
  }

  const students = await getAllStudents(undefined, branchId);

  return <DashboardClient initialStudents={students} branchId={branchId} />;
}
