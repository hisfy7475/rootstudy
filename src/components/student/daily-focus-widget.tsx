import { Card } from '@/components/ui/card';
import { Zap, AlertCircle } from 'lucide-react';
import { getTodayFocusProgress } from '@/lib/actions/student';

/**
 * 단계 9: 오늘의 자동 상점 진행도 위젯
 *
 * 학습일 종료 전 실시간 표시.
 * - 학습시간 게이지 (X / 3시간)
 * - 미분류 시간 (현재 N분 / 5분 grace)
 * - 주말 캡 안내
 */
export async function DailyFocusWidget() {
  const progress = await getTodayFocusProgress();
  if (!progress) return null;

  const { studyMinutes, unclassifiedMinutes, targetMinutes, graceMinutes, isWeekday } = progress;
  const studyPct = Math.min(100, (studyMinutes / targetMinutes) * 100);
  const unclassifiedExceeded = unclassifiedMinutes > graceMinutes;

  const hours = Math.floor(studyMinutes / 60);
  const mins = studyMinutes % 60;

  if (!isWeekday) {
    return (
      <Card className='bg-gray-50 p-4'>
        <p className='text-text-muted flex items-center gap-1.5 text-xs'>
          <AlertCircle className='h-3.5 w-3.5' />
          오늘은 주말이라 자동 상점이 부여되지 않습니다.
        </p>
      </Card>
    );
  }

  return (
    <Card className='space-y-3 p-4'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-100'>
            <Zap className='h-4 w-4 text-yellow-600' />
          </div>
          <p className='text-sm font-semibold'>오늘의 자동 상점</p>
        </div>
        {studyMinutes >= targetMinutes && !unclassifiedExceeded ? (
          <span className='text-xs font-bold text-green-600'>조건 충족</span>
        ) : (
          <span className='text-text-muted text-xs'>진행 중</span>
        )}
      </div>

      {/* 학습시간 게이지 */}
      <div className='space-y-1'>
        <div className='flex items-center justify-between text-xs'>
          <span className='text-text-muted'>학습시간</span>
          <span className='font-medium'>
            {hours}시간 {mins}분 / {Math.floor(targetMinutes / 60)}시간
          </span>
        </div>
        <div className='h-2 w-full overflow-hidden rounded-full bg-gray-100'>
          <div className='h-full bg-yellow-500 transition-all' style={{ width: `${studyPct}%` }} />
        </div>
      </div>

      {/* 미분류 시간 */}
      <div className='space-y-1'>
        <div className='flex items-center justify-between text-xs'>
          <span className='text-text-muted'>미분류 시간</span>
          <span className={unclassifiedExceeded ? 'font-medium text-red-600' : 'font-medium'}>
            {unclassifiedMinutes}분 (허용 {graceMinutes}분까지)
          </span>
        </div>
        <div className='h-2 w-full overflow-hidden rounded-full bg-gray-100'>
          <div
            className={`h-full transition-all ${unclassifiedExceeded ? 'bg-red-500' : 'bg-green-500'}`}
            style={{
              width: `${Math.min(100, (unclassifiedMinutes / Math.max(1, graceMinutes * 2)) * 100)}%`,
            }}
          />
        </div>
      </div>

      <p className='text-text-muted text-[10px] leading-relaxed'>
        오늘 학습이 끝나면 자동으로 +1점이 부여됩니다.
        <span className='block opacity-60'>(다음날 새벽 정산)</span>
      </p>
    </Card>
  );
}
