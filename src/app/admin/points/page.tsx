import { getPointsOverview, getAllPointsHistory, getAllStudents } from '@/lib/actions/admin';
import { PointsClient } from './points-client';

export default async function PointsManagementPage() {
  const [overview, history, students] = await Promise.all([
    getPointsOverview(),
    getAllPointsHistory(),
    getAllStudents(),
  ]);

  return <PointsClient initialOverview={overview} initialHistory={history} students={students} />;
}
