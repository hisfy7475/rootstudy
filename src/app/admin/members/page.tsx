import { getAllMembers, getAllAdmins, getAllParentsWithStudents } from '@/lib/actions/admin';
import { getAllBranches } from '@/lib/actions/branch';
import { getStudentTypes } from '@/lib/actions/student-type';
import { MembersClient } from './members-client';

export default async function MembersManagementPage() {
  const [members, admins, branches, parentsWithStudents, studentTypes] = await Promise.all([
    getAllMembers(),
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
    />
  );
}
