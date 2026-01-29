'use client';

import { FocusScoreDisplay } from '@/components/student/focus-score-display';
import { FocusChart } from '@/components/student/focus-chart';
import { Card } from '@/components/ui/card';
import { Brain, Clock, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface FocusDetail {
  id: string;
  score: number;
  note: string | null;
  recordedAt: string;
}

interface WeeklyData {
  date: string;
  dayLabel: string;
  avgScore: number | null;
}

interface FocusPageClientProps {
  todayScore: number | null;
  previousScore: number | null;
  weeklyData: WeeklyData[];
  todayDetails: FocusDetail[];
}

export function FocusPageClient({
  todayScore,
  previousScore,
  weeklyData,
  todayDetails,
}: FocusPageClientProps) {
  // 주간 평균 계산
  const weeklyScores = weeklyData.filter(d => d.avgScore !== null);
  const weeklyAvg = weeklyScores.length > 0
    ? weeklyScores.reduce((sum, d) => sum + (d.avgScore || 0), 0) / weeklyScores.length
    : null;

  return (
    <div className="p-4 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Brain className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text">몰입도 확인</h1>
          <p className="text-sm text-text-muted">관리자가 측정한 학습 몰입도</p>
        </div>
      </div>

      {/* 오늘의 몰입도 */}
      <FocusScoreDisplay 
        score={todayScore} 
        previousScore={previousScore}
      />

      {/* 주간 그래프 */}
      <FocusChart data={weeklyData} />

      {/* 주간 통계 */}
      <Card className="p-4">
        <h3 className="font-semibold text-text mb-3">이번 주 통계</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-2xl font-bold text-primary">
              {weeklyAvg ? weeklyAvg.toFixed(1) : '-'}
            </p>
            <p className="text-xs text-text-muted">평균 점수</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-xl">
            <p className="text-2xl font-bold text-accent">
              {weeklyScores.length}
            </p>
            <p className="text-xs text-text-muted">측정 횟수</p>
          </div>
        </div>
      </Card>

      {/* 오늘의 상세 기록 */}
      {todayDetails.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-text mb-3">오늘의 기록</h3>
          <div className="space-y-3">
            {todayDetails.map((detail) => (
              <div
                key={detail.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">
                    {detail.score}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {format(new Date(detail.recordedAt), 'HH:mm', { locale: ko })}
                    </span>
                  </div>
                  {detail.note && (
                    <div className="flex items-start gap-1.5">
                      <MessageSquare className="w-3 h-3 text-text-muted mt-0.5 shrink-0" />
                      <p className="text-sm text-text">{detail.note}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 안내 문구 */}
      <div className="bg-primary/10 rounded-2xl p-4">
        <p className="text-sm text-text">
          <span className="font-semibold">💡 몰입도란?</span> 관리자가 순회하며 측정하는 
          학습 집중도입니다. 높은 점수를 유지하면 학습 효율이 올라가요!
        </p>
      </div>
    </div>
  );
}
