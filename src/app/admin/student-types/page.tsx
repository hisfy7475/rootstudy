import { getStudentTypes, getStudentTypeStudentCounts } from '@/lib/actions/student-type';
import { createClient } from '@/lib/supabase/server';
import StudentTypesClient from './student-types-client';

export default async function StudentTypesPage() {
  const supabase = await createClient();

  // 현재 로그인한 관리자의 branch_id 조회
  const { data: { user } } = await supabase.auth.getUser();
  let adminBranchId: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', user.id)
      .single();
    adminBranchId = profile?.branch_id || null;
  }

  const [studentTypes, studentCounts] = await Promise.all([
    getStudentTypes(),
    getStudentTypeStudentCounts(),
  ]);

  // 학생 수 매핑
  const typesWithCount = studentTypes.map(type => ({
    ...type,
    studentCount: studentCounts[type.id] || 0,
  }));

  const unassignedCount = studentCounts['unassigned'] || 0;

  return (
    <StudentTypesClient
      initialTypes={typesWithCount}
      adminBranchId={adminBranchId}
      unassignedCount={unassignedCount}
    />
  );
}
