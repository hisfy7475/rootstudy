import { cn } from '@/lib/utils';
import { LogIn, LogOut, Coffee } from 'lucide-react';

export type AttendanceStatus = 'checked_in' | 'checked_out' | 'on_break';

interface StatusBadgeProps {
  status: AttendanceStatus;
  className?: string;
}

const statusConfig = {
  checked_in: {
    label: '입실중',
    icon: LogIn,
    bgColor: 'bg-success/20',
    textColor: 'text-green-700',
    dotColor: 'bg-green-500',
  },
  checked_out: {
    label: '퇴실',
    icon: LogOut,
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
    dotColor: 'bg-gray-400',
  },
  on_break: {
    label: '외출중',
    icon: Coffee,
    bgColor: 'bg-warning/30',
    textColor: 'text-amber-700',
    dotColor: 'bg-amber-500',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-full',
        config.bgColor,
        className
      )}
    >
      {/* 상태 점 (깜빡임 애니메이션) */}
      <span className="relative flex h-2.5 w-2.5">
        {status === 'checked_in' && (
          <span 
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              config.dotColor
            )} 
          />
        )}
        <span 
          className={cn(
            'relative inline-flex rounded-full h-2.5 w-2.5',
            config.dotColor
          )} 
        />
      </span>
      
      <Icon className={cn('w-4 h-4', config.textColor)} />
      <span className={cn('text-sm font-medium', config.textColor)}>
        {config.label}
      </span>
    </div>
  );
}
