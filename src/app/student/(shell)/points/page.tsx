import { getPoints, getPointPresets } from '@/lib/actions/student';
import { PointsPageClient } from './points-client';
import { DailyFocusWidget } from '@/components/student/daily-focus-widget';
import { Last7DaysCalendarStrip } from '@/components/student/last-7-days-calendar-strip';
import { isDailyFocusActive, isDailyFocusHistoryVisible } from '@/lib/utils';

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
      {/*
        일일 자동 상점은 REWARD_RULES.dailyFocusEndDate 부터 중단.
        진행도 위젯은 즉시 감추고, 최근 7일 이력은 마지막 부여분 알림(종료일 09:00)을 받은
        학생이 확인할 수 있도록 종료 +7일까지 남긴다.
      */}
      {(isDailyFocusActive() || isDailyFocusHistoryVisible()) && (
        <div className='space-y-4 px-4 pt-4'>
          {isDailyFocusActive() && <DailyFocusWidget />}
          {isDailyFocusHistoryVisible() && <Last7DaysCalendarStrip />}
        </div>
      )}
      <PointsPageClient
        points={formattedPoints}
        summary={summary}
        rewardPresets={rewardPresets.map((r) => ({ reason: r.reason, amount: r.amount }))}
        penaltyPresets={penaltyPresets.map((p) => ({ reason: p.reason, amount: p.amount }))}
      />
    </div>
  );
}
