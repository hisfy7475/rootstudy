'use client';

import { Card } from '@/components/ui/card';
import { Clock, BookOpen, Brain, LogIn, LogOut, Coffee } from 'lucide-react';
import { cn } from '@/lib/utils';

type AttendanceStatus = 'checked_in' | 'checked_out' | 'on_break';

interface StudentStatusCardProps {
  status: AttendanceStatus;
  studyTimeSeconds: number;
  currentSubject: string | null;
  focusScore: number | null;
  lastUpdate?: string | null;
}

const statusConfig = {
  checked_in: {
    label: '입실중',
    icon: LogIn,
    bgColor: 'bg-success/10',
    textColor: 'text-green-600',
    borderColor: 'border-success/30',
  },
  checked_out: {
    label: '퇴실',
    icon: LogOut,
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-500',
    borderColor: 'border-gray-200',
  },
  on_break: {
    label: '외출중',
    icon: Coffee,
    bgColor: 'bg-warning/10',
    textColor: 'text-amber-600',
    borderColor: 'border-warning/30',
  },
};

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분`;
}

function formatLastUpdate(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function StudentStatusCard({
  status,
  studyTimeSeconds,
  currentSubject,
  focusScore,
  lastUpdate,
}: StudentStatusCardProps) {
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div className="space-y-3">
      {/* 현재 상태 */}
      <Card className={cn('p-4 border-2', config.borderColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center', config.bgColor)}>
              <StatusIcon className={cn('w-5 h-5', config.textColor)} />
            </div>
            <div>
              <p className="text-xs text-text-muted">현재 상태</p>
              <p className={cn('font-bold text-lg', config.textColor)}>
                {config.label}
              </p>
            </div>
          </div>
          {lastUpdate && status !== 'checked_out' && (
            <div className="text-right">
              <p className="text-xs text-text-muted">
                {status === 'checked_in' ? '입실 시간' : '외출 시작'}
              </p>
              <p className="text-sm font-medium text-text">
                {formatLastUpdate(lastUpdate)}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 학습 정보 그리드 */}
      <div className="grid grid-cols-3 gap-3">
        {/* 학습시간 */}
        <Card className="p-3">
          <div className="flex flex-col items-center text-center">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs text-text-muted mb-1">오늘 학습</p>
            <p className="font-bold text-text text-sm">
              {studyTimeSeconds > 0 ? formatTime(studyTimeSeconds) : '-'}
            </p>
          </div>
        </Card>

        {/* 현재 과목 */}
        <Card className="p-3">
          <div className="flex flex-col items-center text-center">
            <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center mb-2">
              <BookOpen className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-xs text-text-muted mb-1">현재 과목</p>
            <p className="font-bold text-text text-sm truncate w-full">
              {currentSubject || '-'}
            </p>
          </div>
        </Card>

        {/* 몰입도 */}
        <Card className="p-3">
          <div className="flex flex-col items-center text-center">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center mb-2">
              <Brain className="w-4 h-4 text-secondary" />
            </div>
            <p className="text-xs text-text-muted mb-1">몰입도</p>
            <p className="font-bold text-text text-sm">
              {focusScore !== null ? `${focusScore}점` : '-'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
