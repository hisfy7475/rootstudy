import { getAllMembers, getAllAdmins } from '@/lib/actions/admin';
import { getAllBranches } from '@/lib/actions/branch';
import { MembersClient } from './members-client';

export default async function MembersManagementPage() {
  const [members, admins, branches] = await Promise.all([
    getAllMembers(),
    getAllAdmins(),
    getAllBranches(),
  ]);

  // 학생과 학부모 분리
  const students = members.filter(m => m.user_type === 'student');
  const parents = members.filter(m => m.user_type === 'parent');

  return (
    <MembersClient 
      initialStudents={students} 
      initialParents={parents}
      initialAdmins={admins}
      branches={branches}
    />
  );
}
