import { getPoints } from '@/lib/actions/student';
import { PointsPageClient } from './points-client';

export default async function PointsPage() {
  const { points, summary } = await getPoints();

  const formattedPoints = points.map(p => ({
    id: p.id,
    type: p.type as 'reward' | 'penalty',
    amount: p.amount,
    reason: p.reason,
    isAuto: p.is_auto,
    createdAt: p.created_at,
  }));

  return (
    <PointsPageClient
      points={formattedPoints}
      summary={summary}
    />
  );
}
