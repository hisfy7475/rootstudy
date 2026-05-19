import { Card } from '@/components/ui/card';
import { getRecentDailyFocusEvaluations } from '@/lib/actions/student';
import { Check, X, Minus } from 'lucide-react';

/**
 * 단계 9: 최근 7일 자동 상점 캘린더 스트립
 *
 * dot 7개 — 부여 / 미부여(사유) / 주말 캡(회색)
 */
export async function Last7DaysCalendarStrip() {
  const evaluations = await getRecentDailyFocusEvaluations(7);

  // 어제부터 7일치 — 평가 데이터가 없는 날도 placeholder (회색)
  const today = new Date();
  const days: Array<{
    date: string;
    label: string;
    eval: (typeof evaluations)[number] | null;
  }> = [];
  for (let i = 7; i >= 1; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const found = evaluations.find((e) => e.study_date === dateStr);
    days.push({
      date: dateStr,
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      eval: found ?? null,
    });
  }

  return (
    <Card className='p-4'>
      <h3 className='mb-3 text-sm font-semibold'>최근 7일 자동 상점</h3>
      <div className='flex items-center justify-between gap-1'>
        {days.map((d) => {
          const e = d.eval;
          const granted = e?.granted ?? false;
          const isWeekend = e ? !e.is_weekday : false;
          let icon: React.ReactNode;
          let bgClass: string;
          let title: string;

          if (!e) {
            icon = <Minus className='h-3 w-3 text-gray-400' />;
            bgClass = 'bg-gray-100';
            title = '데이터 없음';
          } else if (granted) {
            icon = <Check className='h-3.5 w-3.5 text-green-600' />;
            bgClass = 'bg-green-100';
            title = `${d.label}: +1점 (학습 ${Math.floor(e.study_minutes / 60)}h ${e.study_minutes % 60}m)`;
          } else if (isWeekend) {
            icon = <Minus className='h-3 w-3 text-gray-400' />;
            bgClass = 'bg-gray-100';
            title = `${d.label}: 주말 (캡)`;
          } else {
            icon = <X className='h-3.5 w-3.5 text-red-500' />;
            bgClass = 'bg-red-50';
            title = `${d.label}: 미부여 — ${e.granted_reason ?? '조건 미달'}`;
          }

          return (
            <div key={d.date} className='flex flex-col items-center gap-1' title={title}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-full ${bgClass}`}>
                {icon}
              </div>
              <span className='text-text-muted text-[10px]'>{d.label}</span>
            </div>
          );
        })}
      </div>
      <p className='text-text-muted mt-2 text-[10px]'>
        평일 3시간 학습 + 미분류 ≤ 5분 시 +1점 자동 부여
      </p>
    </Card>
  );
}
