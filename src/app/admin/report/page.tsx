import { createClient } from '@/lib/supabase/server';
import { getStudentsForReport } from '@/lib/actions/report';
import { formatDateKST, getWeekStart } from '@/lib/utils';
import { AdminReportClient } from './report-client';

export default async function AdminReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-6 text-sm text-text-muted">로그인이 필요합니다.</div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('branch_id')
    .eq('id', user.id)
    .single();

  const branchId = profile?.branch_id ?? undefined;
  const students = await getStudentsForReport(branchId);
  const weekStartStr = formatDateKST(getWeekStart());

  return (
    <AdminReportClient
      students={students}
      initialWeekStart={weekStartStr}
      branchId={profile?.branch_id ?? null}
    />
  );
}
