import { getPoints, getPointPresets } from '@/lib/actions/student';
import { PointsPageClient } from './points-client';

export default async function PointsPage() {
  const [{ points, summary }, { rewardPresets, penaltyPresets }] = await Promise.all([
    getPoints(),
    getPointPresets(),
  ]);

  const formattedPoints = points.map((p) => ({
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
      rewardPresets={rewardPresets.map((r) => ({ reason: r.reason, amount: r.amount }))}
      penaltyPresets={penaltyPresets.map((p) => ({ reason: p.reason, amount: p.amount }))}
    />
  );
}
