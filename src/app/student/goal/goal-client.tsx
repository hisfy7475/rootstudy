'use client';

import { useState, useTransition, useCallback } from 'react';
import { TimePicker } from '@/components/student/time-picker';
import { GoalCalendar } from '@/components/student/goal-calendar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Target, Check, Clock } from 'lucide-react';
import { setStudyGoal } from '@/lib/actions/student';

interface GoalDay {
  date: string;
  targetTime: string | null;
  achieved: boolean | null;
}

interface GoalPageClientProps {
  goals: GoalDay[];
  todayGoal: {
    targetTime: string;
    achieved: boolean;
  } | null;
}

export function GoalPageClient({ goals, todayGoal }: GoalPageClientProps) {
  const [time, setTime] = useState({
    hour: todayGoal ? parseInt(todayGoal.targetTime.split(':')[0]) : 8,
    minute: todayGoal ? parseInt(todayGoal.targetTime.split(':')[1]) : 0,
  });
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleTimeChange = useCallback((newTime: { hour: number; minute: number }) => {
    setTime(newTime);
    setSaved(false);
  }, []);

  const handleSave = () => {
    const timeStr = `${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}:00`;
    
    startTransition(async () => {
      const result = await setStudyGoal(timeStr);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  return (
    <div className="p-4 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Target className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text">등원 목표 설정</h1>
          <p className="text-sm text-text-muted">목표 시간까지 등원하면 상점!</p>
        </div>
      </div>

      {/* 오늘의 목표 카드 */}
      <Card className="p-6">
        <div className="text-center mb-6">
          <p className="text-sm text-text-muted mb-1">오늘의 등원 목표</p>
          {todayGoal ? (
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-2xl font-bold text-text">
                {todayGoal.targetTime.slice(0, 5)}
              </span>
              {todayGoal.achieved && (
                <div className="ml-2 px-2 py-1 bg-success/20 rounded-full">
                  <span className="text-xs font-medium text-green-700">달성!</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-lg text-text-muted">목표를 설정해주세요</span>
          )}
        </div>

        {/* 시간 피커 */}
        <div className="mb-6">
          <TimePicker value={time} onChange={handleTimeChange} />
        </div>

        {/* 저장 버튼 */}
        <Button
          onClick={handleSave}
          disabled={isPending}
          className="w-full py-6 text-lg gap-2"
        >
          {saved ? (
            <>
              <Check className="w-5 h-5" />
              저장됨!
            </>
          ) : isPending ? (
            '저장 중...'
          ) : (
            '목표 저장하기'
          )}
        </Button>
      </Card>

      {/* 주간 달력 */}
      <GoalCalendar goals={goals} />

      {/* 안내 문구 */}
      <div className="bg-accent/20 rounded-2xl p-4">
        <p className="text-sm text-text">
          <span className="font-semibold">💡 Tip:</span> 목표 시간까지 입실하면 
          <span className="text-green-600 font-semibold"> 상점 1점</span>이 자동으로 부여됩니다.
          늦으면 <span className="text-red-500 font-semibold">벌점 1점</span>이 부여되니 주의하세요!
        </p>
      </div>
    </div>
  );
}
