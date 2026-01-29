'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { 
  BarChart3, 
  ChevronLeft, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  BookOpen,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import { 
  getStudyStatsByPeriod, 
  getSubjectStudyTime, 
  getDailyStudyTrend,
  getStudyComparison,
  type StudyPeriod
} from '@/lib/actions/student';
import { SubjectTimeList } from '@/components/student/subject-time-list';
import { StudyTrendChart } from '@/components/student/study-trend-chart';
import { UnclassifiedModal } from '@/components/student/unclassified-modal';

interface UnclassifiedSegment {
  id: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

interface StatsPageClientProps {
  initialPeriod: StudyPeriod;
  initialStats: {
    totalSeconds: number;
    periodStart: string;
    periodEnd: string;
  };
  initialSubjectTime: {
    subjectTimes: Record<string, number>;
    unclassifiedSeconds: number;
    unclassifiedSegments: UnclassifiedSegment[];
  };
  initialTrend: Array<{ date: string; totalSeconds: number; subjectTimes: Record<string, number> }>;
  initialComparison: {
    currentSeconds: number;
    previousSeconds: number;
    changePercent: number;
    changeDirection: 'up' | 'down' | 'same';
  };
  weeklyProgress: {
    goalHours: number;
    actualMinutes: number;
    progressPercent: number;
    studentTypeName: string | null;
  };
  availableSubjects: string[] | null;
}

const periodLabels: Record<StudyPeriod, string> = {
  daily: '일간',
  weekly: '주간',
  monthly: '월간',
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

function formatPeriodLabel(period: StudyPeriod, date: Date): string {
  switch (period) {
    case 'daily':
      return format(date, 'M월 d일 (E)', { locale: ko });
    case 'weekly': {
      const weekEnd = addDays(date, 6);
      return `${format(date, 'M/d', { locale: ko })} ~ ${format(weekEnd, 'M/d', { locale: ko })}`;
    }
    case 'monthly':
      return format(date, 'yyyy년 M월', { locale: ko });
  }
}

export function StatsPageClient({
  initialPeriod,
  initialStats,
  initialSubjectTime,
  initialTrend,
  initialComparison,
  weeklyProgress,
  availableSubjects,
}: StatsPageClientProps) {
  const [period, setPeriod] = useState<StudyPeriod>(initialPeriod);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [stats, setStats] = useState(initialStats);
  const [subjectTime, setSubjectTime] = useState(initialSubjectTime);
  const [trend, setTrend] = useState(initialTrend);
  const [comparison, setComparison] = useState(initialComparison);
  const [isPending, startTransition] = useTransition();
  
  // 미분류 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<UnclassifiedSegment | null>(null);

  const fetchData = async (newPeriod: StudyPeriod, date: Date) => {
    startTransition(async () => {
      const [newStats, newSubjectTime, newComparison] = await Promise.all([
        getStudyStatsByPeriod(newPeriod, date),
        getSubjectStudyTime(newPeriod, date),
        getStudyComparison(newPeriod, date),
      ]);
      
      // 주간/월간일 때만 추이 데이터 갱신
      if (newPeriod !== 'daily') {
        const newTrend = await getDailyStudyTrend(newPeriod as 'weekly' | 'monthly', date);
        setTrend(newTrend);
      }
      
      setStats({
        totalSeconds: newStats.totalSeconds,
        periodStart: newStats.periodStart,
        periodEnd: newStats.periodEnd,
      });
      setSubjectTime({
        subjectTimes: newSubjectTime.subjectTimes,
        unclassifiedSeconds: newSubjectTime.unclassifiedSeconds,
        unclassifiedSegments: newSubjectTime.unclassifiedSegments,
      });
      setComparison(newComparison);
    });
  };

  const handlePeriodChange = (newPeriod: StudyPeriod) => {
    setPeriod(newPeriod);
    setCurrentDate(new Date());
    fetchData(newPeriod, new Date());
  };

  const handleDateNav = (direction: 'prev' | 'next') => {
    let newDate: Date;
    
    switch (period) {
      case 'daily':
        newDate = direction === 'prev' ? subDays(currentDate, 1) : addDays(currentDate, 1);
        break;
      case 'weekly':
        newDate = direction === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1);
        break;
      case 'monthly':
        newDate = direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1);
        break;
    }
    
    // 미래 날짜 방지
    if (newDate > new Date()) {
      newDate = new Date();
    }
    
    setCurrentDate(newDate);
    fetchData(period, newDate);
  };

  const handleUnclassifiedClick = (segment: UnclassifiedSegment) => {
    setSelectedSegment(segment);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedSegment(null);
  };

  const handleAssignComplete = () => {
    // 데이터 새로고침
    fetchData(period, currentDate);
    handleModalClose();
  };

  const isToday = format(currentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text">학습 통계</h1>
          <p className="text-sm text-text-muted">학습 시간을 확인하세요</p>
        </div>
      </div>

      {/* 기간 선택 탭 */}
      <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
        {(['daily', 'weekly', 'monthly'] as StudyPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            disabled={isPending}
            className={cn(
              'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all',
              period === p
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text'
            )}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* 날짜 네비게이션 */}
      <div className="flex items-center justify-between bg-card rounded-xl p-3">
        <button
          onClick={() => handleDateNav('prev')}
          disabled={isPending}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-text-muted" />
        </button>
        <span className="font-medium text-text">
          {formatPeriodLabel(period, currentDate)}
        </span>
        <button
          onClick={() => handleDateNav('next')}
          disabled={isPending || isToday}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isToday ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-100'
          )}
        >
          <ChevronRight className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      {/* 총 학습 시간 카드 */}
      <Card className={cn('p-4', isPending && 'opacity-60')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <span className="font-medium text-text">총 학습시간</span>
          </div>
          {/* 비교 지표 */}
          <div className={cn(
            'flex items-center gap-1 text-sm font-medium',
            comparison.changeDirection === 'up' && 'text-success',
            comparison.changeDirection === 'down' && 'text-error',
            comparison.changeDirection === 'same' && 'text-text-muted'
          )}>
            {comparison.changeDirection === 'up' && <TrendingUp className="w-4 h-4" />}
            {comparison.changeDirection === 'down' && <TrendingDown className="w-4 h-4" />}
            {comparison.changeDirection === 'same' && <Minus className="w-4 h-4" />}
            <span>
              {comparison.changeDirection === 'same' 
                ? '변동없음' 
                : `${comparison.changeDirection === 'up' ? '+' : '-'}${comparison.changePercent}%`}
            </span>
          </div>
        </div>
        <p className="text-3xl font-bold text-primary">
          {formatDuration(stats.totalSeconds)}
        </p>
        {period === 'weekly' && weeklyProgress.goalHours > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-text-muted">주간 목표 달성률</span>
              <span className={cn(
                'font-medium',
                weeklyProgress.progressPercent >= 100 ? 'text-success' : 'text-primary'
              )}>
                {weeklyProgress.progressPercent}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  weeklyProgress.progressPercent >= 100 
                    ? 'bg-success' 
                    : 'bg-gradient-to-r from-primary to-accent'
                )}
                style={{ width: `${Math.min(100, weeklyProgress.progressPercent)}%` }}
              />
            </div>
            <p className="text-xs text-text-muted mt-1">
              목표: {weeklyProgress.goalHours}시간 ({weeklyProgress.studentTypeName || '미설정'})
            </p>
          </div>
        )}
      </Card>

      {/* 과목별 학습시간 */}
      <Card className={cn('p-4', isPending && 'opacity-60')}>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-text">과목별 학습시간</h3>
        </div>
        
        {Object.keys(subjectTime.subjectTimes).length === 0 && subjectTime.unclassifiedSeconds === 0 ? (
          <div className="text-center py-6 text-text-muted">
            <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>학습 기록이 없습니다</p>
          </div>
        ) : (
          <SubjectTimeList
            subjectTimes={subjectTime.subjectTimes}
            unclassifiedSeconds={subjectTime.unclassifiedSeconds}
            unclassifiedSegments={subjectTime.unclassifiedSegments}
            totalSeconds={stats.totalSeconds}
            onUnclassifiedClick={handleUnclassifiedClick}
          />
        )}
      </Card>

      {/* 추이 그래프 (주간/월간에서만 표시) */}
      {period !== 'daily' && trend.length > 0 && (
        <Card className={cn('p-4', isPending && 'opacity-60')}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-text">
              {period === 'weekly' ? '일별' : '일별'} 학습 추이
            </h3>
          </div>
          <StudyTrendChart data={trend} period={period} />
        </Card>
      )}

      {/* 미분류 시간 안내 */}
      {subjectTime.unclassifiedSegments.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-xl">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-warning">미분류 시간이 있습니다</p>
            <p className="text-text-muted mt-1">
              과목이 지정되지 않은 학습 시간을 클릭하여 과목을 할당할 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 미분류 시간 할당 모달 */}
      <UnclassifiedModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        segment={selectedSegment}
        availableSubjects={availableSubjects}
        onAssignComplete={handleAssignComplete}
      />
    </div>
  );
}
