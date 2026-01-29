import { getAllBranches } from '@/lib/actions/branch';
import { getDateTypeDefinitions, getDateAssignments } from '@/lib/actions/date-type';
import DateTypesClient from './date-types-client';

export default async function DateTypesPage() {
  const branches = await getAllBranches();
  
  // 첫 번째 지점의 데이터 로드
  const firstBranch = branches[0];
  let dateTypes: Awaited<ReturnType<typeof getDateTypeDefinitions>> = [];
  let assignments: Awaited<ReturnType<typeof getDateAssignments>> = [];

  if (firstBranch) {
    // 현재 달의 시작과 끝
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    [dateTypes, assignments] = await Promise.all([
      getDateTypeDefinitions(firstBranch.id),
      getDateAssignments(
        firstBranch.id,
        startOfMonth.toISOString().split('T')[0],
        endOfMonth.toISOString().split('T')[0]
      ),
    ]);
  }

  return (
    <DateTypesClient
      branches={branches}
      initialDateTypes={dateTypes}
      initialAssignments={assignments}
    />
  );
}
