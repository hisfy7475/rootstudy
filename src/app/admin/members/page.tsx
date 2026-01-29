import { getAllMembers } from '@/lib/actions/admin';
import { MembersClient } from './members-client';

export default async function MembersManagementPage() {
  const members = await getAllMembers();

  // 학생과 학부모 분리
  const students = members.filter(m => m.user_type === 'student');
  const parents = members.filter(m => m.user_type === 'parent');

  return <MembersClient initialStudents={students} initialParents={parents} />;
}
