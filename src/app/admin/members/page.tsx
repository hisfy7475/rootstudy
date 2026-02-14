import { getAllMembers, getAllAdmins, getAllParentsWithStudents } from '@/lib/actions/admin';
import { getAllBranches } from '@/lib/actions/branch';
import { getStudentTypes } from '@/lib/actions/student-type';
import { createClient } from '@/lib/supabase/server';
import { MembersClient } from './members-client';

export default async function MembersManagementPage() {
  const supabase = await createClient();
  
  // 현재 로그인한 관리자의 branch_id 조회
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

  const [members, admins, branches, parentsWithStudents, studentTypes] = await Promise.all([
    getAllMembers(undefined, branchId),
    getAllAdmins(),
    getAllBranches(),
    getAllParentsWithStudents(),
    getStudentTypes(),
  ]);

  // 학생 분리
  const students = members.filter(m => m.user_type === 'student');

  return (
    <MembersClient 
      initialStudents={students} 
      initialParents={parentsWithStudents}
      initialAdmins={admins}
      branches={branches}
      initialStudentTypes={studentTypes.map(t => ({ id: t.id, name: t.name }))}
      branchId={branchId}
    />
  );
}
