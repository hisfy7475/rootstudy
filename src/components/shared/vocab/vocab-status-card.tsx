import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Check, ChevronRight, AlertCircle, Gift } from 'lucide-react';
import type { VocabWeekStatus, VocabDayStatus } from '@/lib/actions/vocab';

/**
 * 영단어 홈 상단 현황 카드 — 오늘 응시 여부 + 이번 학습주 개근 진행도.
 *
 * 이 카드가 없으면 학생은 "내가 오늘 봤는지", "왜 상점을 못 받았는지"를 앱에서 확인할 방법이
 * 없어 센터 문의로 이어진다(레거시 앱이 보내는 "미응시" 푸시를 반박할 근거도 없다).
 * 숫자는 전부 getMyVocabWeekStatus 가 개근 판정과 같은 헬퍼로 계산한 값이다.
 */

const DAY_STYLE: Record<VocabDayStatus, string> = {
  normal: 'bg-green-100 text-green-700 border-green-200',
  auto: 'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  none: 'bg-gray-100 text-gray-400 border-gray-200',
  future: 'bg-transparent text-gray-300 border-gray-100',
};

const DAY_MARK: Record<VocabDayStatus, string> = {
  normal: '완료',
  auto: '자동',
  in_progress: '진행',
  none: '미응시',
  future: '-',
};

/** '2026-07-21' → '7/21' */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function VocabStatusCard({ status }: { status: VocabWeekStatus }) {
  const { today, week, isWeekday, todayStudyDate } = status;

  return (
    <Card variant='bordered' className='space-y-4 p-4'>
      {/* 오늘 */}
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-muted-foreground text-xs'>오늘 ({shortDate(todayStudyDate)})</p>
          {today.status === 'normal' && (
            <p className='text-foreground flex items-center gap-1.5 font-semibold'>
              <Check className='h-4 w-4 shrink-0 text-green-600' />
              시험 완료
              {today.score !== null && today.total !== null && (
                <span className='text-muted-foreground text-sm font-normal'>
                  {today.score}/{today.total}
                </span>
              )}
            </p>
          )}
          {today.status === 'auto' && (
            <p className='text-foreground font-semibold'>
              자동 마감됨
              <span className='text-muted-foreground ml-1.5 text-sm font-normal'>
                시간 초과로 자동 제출되었어요
              </span>
            </p>
          )}
          {today.status === 'in_progress' && (
            <p className='text-foreground font-semibold'>시험 진행 중</p>
          )}
          {today.status === 'none' && (
            <p className='text-foreground font-semibold'>아직 응시하지 않았어요</p>
          )}
        </div>

        {today.status === 'none' && (
          <Link
            href='/student/vocab/exam'
            className='bg-primary text-primary-foreground flex shrink-0 items-center gap-0.5 rounded-full px-3 py-2 text-sm font-semibold'
          >
            시험 보기
            <ChevronRight className='h-4 w-4' />
          </Link>
        )}
        {today.status === 'in_progress' && today.examId && (
          <Link
            href={`/student/vocab/exam/${today.examId}`}
            className='bg-primary text-primary-foreground flex shrink-0 items-center gap-0.5 rounded-full px-3 py-2 text-sm font-semibold'
          >
            이어서 보기
            <ChevronRight className='h-4 w-4' />
          </Link>
        )}
      </div>

      {/* 이번 주 개근 진행도 */}
      <div className='space-y-2 border-t pt-3'>
        <div className='flex items-baseline justify-between'>
          <p className='text-foreground text-sm font-semibold'>
            이번 주 개근 <span className='text-primary'>{week.normalDays}/5</span>
          </p>
          <p className='text-muted-foreground text-xs'>
            {shortDate(week.mondayStr)}~{shortDate(week.fridayStr)}
          </p>
        </div>

        <div className='grid grid-cols-5 gap-1.5'>
          {week.days.map((d) => (
            <div
              key={d.date}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl border py-1.5',
                DAY_STYLE[d.status],
                d.date === todayStudyDate && 'ring-primary ring-2 ring-offset-1',
              )}
            >
              <span className='text-xs font-semibold'>{d.label}</span>
              <span className='text-[10px]'>{DAY_MARK[d.status]}</span>
            </div>
          ))}
        </div>

        {/* 상점 안내 — 3분기. 5/5인데 미부여인 상태를 반드시 구분해야 자기모순 문구가 안 나온다. */}
        {week.rewardGranted ? (
          <p className='flex items-center gap-1.5 text-xs font-medium text-green-700'>
            <Gift className='h-3.5 w-3.5 shrink-0' />
            이번 주 개근 상점 2점을 받았어요.
          </p>
        ) : week.normalDays >= 5 ? (
          <p className='flex items-start gap-1.5 text-xs font-medium text-amber-700'>
            <AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
            개근을 채웠어요. 상점이 보이지 않으면 센터에 문의해 주세요.
          </p>
        ) : (
          <p className='text-muted-foreground text-xs'>
            월~금 5일 모두 정상 제출하면 상점 2점을 받아요. 자동 마감(시간 초과)은 개근에 포함되지
            않아요.
          </p>
        )}

        {!isWeekday && (
          <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <AlertCircle className='h-3.5 w-3.5 shrink-0' />
            주말 응시는 개근 집계에 포함되지 않습니다.
          </p>
        )}
      </div>
    </Card>
  );
}
