import { getAllMembers, getAllAdmins, getAllParentsWithStudents } from '@/lib/actions/admin';
import { getAllBranches } from '@/lib/actions/branch';
import { MembersClient } from './members-client';

export default async function MembersManagementPage() {
  const [members, admins, branches, parentsWithStudents] = await Promise.all([
    getAllMembers(),
    getAllAdmins(),
    getAllBranches(),
    getAllParentsWithStudents(),
  ]);

  // 학생 분리
  const students = members.filter(m => m.user_type === 'student');

  return (
    <MembersClient 
      initialStudents={students} 
      initialParents={parentsWithStudents}
      initialAdmins={admins}
      branches={branches}
    />
  );
}
