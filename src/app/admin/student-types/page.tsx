import { getStudentTypes, getStudentTypeStudentCounts } from '@/lib/actions/student-type';
import { getAllBranches } from '@/lib/actions/branch';
import StudentTypesClient from './student-types-client';

export default async function StudentTypesPage() {
  const [studentTypes, studentCounts, branches] = await Promise.all([
    getStudentTypes(),
    getStudentTypeStudentCounts(),
    getAllBranches(),
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
      branches={branches}
      unassignedCount={unassignedCount}
    />
  );
}
