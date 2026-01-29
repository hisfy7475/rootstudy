import { getAllBranches } from '@/lib/actions/branch';
import { getDateTypeDefinitions } from '@/lib/actions/date-type';
import { getPeriodDefinitions } from '@/lib/actions/period';
import PeriodsClient from './periods-client';

export default async function PeriodsPage() {
  const branches = await getAllBranches();
  
  // 첫 번째 지점의 데이터 로드
  const firstBranch = branches[0];
  let dateTypes: Awaited<ReturnType<typeof getDateTypeDefinitions>> = [];
  let periods: Awaited<ReturnType<typeof getPeriodDefinitions>> = [];

  if (firstBranch) {
    dateTypes = await getDateTypeDefinitions(firstBranch.id);
    periods = await getPeriodDefinitions(firstBranch.id);
  }

  return (
    <PeriodsClient
      branches={branches}
      initialDateTypes={dateTypes}
      initialPeriods={periods}
    />
  );
}
