import { getPoints, getPointPresets } from '@/lib/actions/student';
import { PointsPageClient } from './points-client';
import { DailyFocusWidget } from '@/components/student/daily-focus-widget';
import { Last7DaysCalendarStrip } from '@/components/student/last-7-days-calendar-strip';

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
    eventKind: p.event_kind,
  }));

  return (
    <div className='space-y-4'>
      <div className='space-y-4 px-4 pt-4'>
        <DailyFocusWidget />
        <Last7DaysCalendarStrip />
      </div>
      <PointsPageClient
        points={formattedPoints}
        summary={summary}
        rewardPresets={rewardPresets.map((r) => ({ reason: r.reason, amount: r.amount }))}
        penaltyPresets={penaltyPresets.map((p) => ({ reason: p.reason, amount: p.amount }))}
      />
    </div>
  );
}
