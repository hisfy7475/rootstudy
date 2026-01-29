'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Check, X, Clock, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { approveSchedule, rejectSchedule } from '@/lib/actions/parent';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface Schedule {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  studentName?: string;
}

interface ScheduleListProps {
  schedules: Schedule[];
  showActions?: boolean;
}

const statusConfig = {
  pending: {
    label: '대기중',
    icon: Clock,
    bgColor: 'bg-warning/10',
    textColor: 'text-amber-600',
  },
  approved: {
    label: '승인됨',
    icon: CheckCircle,
    bgColor: 'bg-success/10',
    textColor: 'text-green-600',
  },
  rejected: {
    label: '거부됨',
    icon: XCircle,
    bgColor: 'bg-error/10',
    textColor: 'text-red-500',
  },
};

function ScheduleItem({ 
  schedule, 
  showActions 
}: { 
  schedule: Schedule; 
  showActions?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const config = statusConfig[schedule.status];
  const StatusIcon = config.icon;

  const handleApprove = () => {
    startTransition(async () => {
      await approveSchedule(schedule.id);
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      await rejectSchedule(schedule.id);
    });
  };

  const scheduledDate = new Date(schedule.scheduled_date);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        {/* 날짜 아이콘 */}
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex flex-col items-center justify-center flex-shrink-0">
          <span className="text-xs text-primary font-medium">
            {format(scheduledDate, 'MMM', { locale: ko })}
          </span>
          <span className="text-lg font-bold text-primary leading-tight">
            {format(scheduledDate, 'd')}
          </span>
        </div>

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-text truncate">{schedule.title}</h3>
            <div className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
              config.bgColor,
              config.textColor
            )}>
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </div>
          </div>
          
          {schedule.studentName && (
            <p className="text-xs text-primary font-medium mb-1">
              {schedule.studentName}
            </p>
          )}
          
          {schedule.description && (
            <p className="text-sm text-text-muted line-clamp-2 mb-2">
              {schedule.description}
            </p>
          )}

          <p className="text-xs text-text-muted">
            {format(scheduledDate, 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
          </p>
        </div>
      </div>

      {/* 승인/거부 버튼 */}
      {showActions && schedule.status === 'pending' && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <Button
            onClick={handleReject}
            disabled={isPending}
            variant="outline"
            className="flex-1 gap-2"
          >
            <X className="w-4 h-4" />
            거부
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isPending}
            className="flex-1 gap-2"
          >
            <Check className="w-4 h-4" />
            승인
          </Button>
        </div>
      )}
    </Card>
  );
}

export function ScheduleList({ schedules, showActions = true }: ScheduleListProps) {
  if (schedules.length === 0) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Calendar className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-text-muted">스케줄이 없습니다</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {schedules.map((schedule) => (
        <ScheduleItem 
          key={schedule.id} 
          schedule={schedule} 
          showActions={showActions}
        />
      ))}
    </div>
  );
}
