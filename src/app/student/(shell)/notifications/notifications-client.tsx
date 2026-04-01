'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getStudentNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/lib/actions/notification';
import {
  Bell,
  Clock,
  AlertCircle,
  Calendar,
  Award,
  MessageCircle,
  Settings,
  Check,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface StudentNotification {
  id: string;
  student_id: string;
  type: 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsClientProps {
  initialNotifications: StudentNotification[];
  initialUnreadCount: number;
}

const typeConfig = {
  late: {
    label: '지각',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  absent: {
    label: '결석',
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  point: {
    label: '상벌점',
    icon: Award,
    color: 'text-primary',
    bgColor: 'bg-primary/5',
    borderColor: 'border-primary/20',
  },
  schedule: {
    label: '스케줄',
    icon: Calendar,
    color: 'text-accent',
    bgColor: 'bg-accent/10',
    borderColor: 'border-accent/30',
  },
  system: {
    label: '시스템',
    icon: Settings,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
  chat: {
    label: '채팅',
    icon: MessageCircle,
    color: 'text-secondary',
    bgColor: 'bg-secondary/10',
    borderColor: 'border-secondary/30',
  },
};

export function NotificationsClient({
  initialNotifications,
  initialUnreadCount,
}: NotificationsClientProps) {
  const [notifications, setNotifications] = useState<StudentNotification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loading, setLoading] = useState(false);

  const refreshNotifications = async () => {
    setLoading(true);
    try {
      const data = await getStudentNotifications();
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    const result = await markNotificationAsRead(id);
    if (result.success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllAsRead = async () => {
    const result = await markAllNotificationsAsRead();
    if (result.success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;

    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  };

  // 그룹화: 오늘, 이번 주, 이전
  const groupedNotifications = {
    today: [] as StudentNotification[],
    thisWeek: [] as StudentNotification[],
    older: [] as StudentNotification[],
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  notifications.forEach((n) => {
    const date = new Date(n.created_at);
    if (date >= todayStart) {
      groupedNotifications.today.push(n);
    } else if (date >= weekStart) {
      groupedNotifications.thisWeek.push(n);
    } else {
      groupedNotifications.older.push(n);
    }
  });

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">알림</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-text-muted">
              읽지 않은 알림 {unreadCount}개
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshNotifications}
            disabled={loading}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
              <Check className="w-4 h-4 mr-1" />
              모두 읽음
            </Button>
          )}
        </div>
      </div>

      {/* 알림 목록 */}
      {notifications.length === 0 ? (
        <Card className="p-8 text-center">
          <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-text-muted">알림이 없습니다</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* 오늘 */}
          {groupedNotifications.today.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-text-muted mb-2 px-1">
                오늘
              </h2>
              <div className="space-y-2">
                {groupedNotifications.today.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkAsRead={handleMarkAsRead}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 이번 주 */}
          {groupedNotifications.thisWeek.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-text-muted mb-2 px-1">
                이번 주
              </h2>
              <div className="space-y-2">
                {groupedNotifications.thisWeek.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkAsRead={handleMarkAsRead}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 이전 */}
          {groupedNotifications.older.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-text-muted mb-2 px-1">
                이전
              </h2>
              <div className="space-y-2">
                {groupedNotifications.older.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkAsRead={handleMarkAsRead}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onMarkAsRead,
  formatDate,
}: {
  notification: StudentNotification;
  onMarkAsRead: (id: string) => void;
  formatDate: (dateStr: string) => string;
}) {
  const config = typeConfig[notification.type];
  const Icon = config.icon;

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
  };

  const content = (
    <Card
      className={cn(
        'p-4 transition-all cursor-pointer hover:shadow-md',
        !notification.is_read && 'border-l-4',
        !notification.is_read && config.borderColor,
        notification.is_read && 'opacity-70'
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            config.bgColor
          )}
        >
          <Icon className={cn('w-5 h-5', config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{notification.title}</span>
            {!notification.is_read && (
              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-text-muted line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatDate(notification.created_at)}
          </p>
        </div>

        {notification.link && (
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
      </div>
    </Card>
  );

  if (notification.link) {
    return <Link href={notification.link}>{content}</Link>;
  }

  return content;
}
