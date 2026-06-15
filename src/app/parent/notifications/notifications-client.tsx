'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getUserNotifications,
  markUserNotificationAsRead,
  markAllUserNotificationsAsRead,
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
import { createClient } from '@/lib/supabase/client';
import { useUnreadCounts } from '@/components/shared/unread-counts-provider';

interface UserNotification {
  id: string;
  user_id: string;
  type: 'late' | 'absent' | 'point' | 'schedule' | 'system' | 'chat';
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface ParentNotificationsClientProps {
  initialNotifications: UserNotification[];
  userId: string | null;
  pageSize: number;
}

function isSafeInternalLink(link: string | null | undefined): link is string {
  return typeof link === 'string' && link.startsWith('/');
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

export function ParentNotificationsClient({
  initialNotifications,
  userId,
  pageSize,
}: ParentNotificationsClientProps) {
  const [notifications, setNotifications] = useState<UserNotification[]>(initialNotifications);
  // 배지 카운트는 헤더와 공유하는 store 에서 읽고/갱신한다.
  const { notif } = useUnreadCounts();
  const unreadCount = notif.count;
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialNotifications.length >= pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const refreshNotifications = async () => {
    setLoading(true);
    try {
      const data = await getUserNotifications({
        limit: pageSize,
        offset: 0,
        excludeTypes: ['chat'],
      });
      setNotifications(data as UserNotification[]);
      setHasMore(data.length >= pageSize);
      notif.refetch();
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    const result = await markUserNotificationAsRead(id);
    if (result.success) {
      const next = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
      setNotifications(next);
      notif.setCount((c) => Math.max(0, c - 1));
      notif.refetch();
    }
  };

  const handleMarkAllAsRead = async () => {
    const result = await markAllUserNotificationsAsRead();
    if (result.success) {
      const next = notifications.map((n) => ({ ...n, is_read: true }));
      setNotifications(next);
      notif.setCount(0);
      notif.refetch();
    }
  };

  // realtime — sidebar.tsx 패턴(setAuth 후 subscribe).
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;
      channel = supabase
        .channel(`parent-notif-page-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // chat type 은 페이지에서 제외(채팅 탭이 별도 표시).
            const newRow = payload.new as UserNotification | undefined;
            if (newRow?.type === 'chat') return;
            setNotifications((prev) => {
              let next = prev;
              if (payload.eventType === 'INSERT') {
                if (newRow && !prev.some((n) => n.id === newRow.id)) {
                  next = [newRow, ...prev];
                }
              } else if (payload.eventType === 'UPDATE') {
                if (newRow) next = prev.map((n) => (n.id === newRow.id ? newRow : n));
              } else if (payload.eventType === 'DELETE') {
                const old = payload.old as { id?: string };
                if (old?.id) next = prev.filter((n) => n.id !== old.id);
              }
              return next;
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  // 무한 스크롤
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await getUserNotifications({
        limit: pageSize,
        offset: notifications.length,
        excludeTypes: ['chat'],
      });
      const rows = data as UserNotification[];
      setNotifications((prev) => {
        const existing = new Set(prev.map((n) => n.id));
        return [...prev, ...rows.filter((r) => !existing.has(r.id))];
      });
      setHasMore(rows.length >= pageSize);
    } catch (error) {
      console.error('Failed to load more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, pageSize, notifications.length]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const node = sentinelRef.current;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        void loadMore();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

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

  const groupedNotifications = {
    today: [] as UserNotification[],
    thisWeek: [] as UserNotification[],
    older: [] as UserNotification[],
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
    <div className='space-y-4 p-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-bold'>알림</h1>
          {unreadCount > 0 && (
            <p className='text-text-muted text-sm'>읽지 않은 알림 {unreadCount}개</p>
          )}
        </div>
        <div className='flex gap-2'>
          <Button variant='ghost' size='sm' onClick={refreshNotifications} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          {unreadCount > 0 && (
            <Button variant='outline' size='sm' onClick={handleMarkAllAsRead}>
              <Check className='mr-1 h-4 w-4' />
              모두 읽음
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <Card className='p-8 text-center'>
          <Bell className='mx-auto mb-3 h-12 w-12 text-gray-300' />
          <p className='text-text-muted'>알림이 없습니다</p>
        </Card>
      ) : (
        <div className='space-y-6'>
          {groupedNotifications.today.length > 0 && (
            <div>
              <h2 className='text-text-muted mb-2 px-1 text-sm font-medium'>오늘</h2>
              <div className='space-y-2'>
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
          {groupedNotifications.thisWeek.length > 0 && (
            <div>
              <h2 className='text-text-muted mb-2 px-1 text-sm font-medium'>이번 주</h2>
              <div className='space-y-2'>
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
          {groupedNotifications.older.length > 0 && (
            <div>
              <h2 className='text-text-muted mb-2 px-1 text-sm font-medium'>이전</h2>
              <div className='space-y-2'>
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
          {hasMore && (
            <div ref={sentinelRef} className='flex h-8 items-center justify-center'>
              {loadingMore && <RefreshCw className='text-text-muted h-4 w-4 animate-spin' />}
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
  notification: UserNotification;
  onMarkAsRead: (id: string) => void;
  formatDate: (dateStr: string) => string;
}) {
  const config = typeConfig[notification.type] ?? typeConfig.system;
  const Icon = config.icon;

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
  };

  const content = (
    <Card
      className={cn(
        'cursor-pointer rounded-2xl border border-gray-200 p-3 shadow-none transition-all hover:border-gray-300 hover:shadow-sm',
        !notification.is_read && 'border-l-4',
        !notification.is_read && config.borderColor,
        notification.is_read && 'opacity-70',
      )}
      onClick={handleClick}
    >
      <div className='flex items-start gap-2.5'>
        <div
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
            config.bgColor,
          )}
        >
          <Icon className={cn('h-4 w-4', config.color)} />
        </div>

        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <span className='truncate text-sm font-medium'>{notification.title}</span>
            {!notification.is_read && (
              <span className='bg-primary h-1.5 w-1.5 flex-shrink-0 rounded-full' />
            )}
          </div>
          <p className='text-text-muted line-clamp-2 text-xs'>{notification.message}</p>
          <p className='mt-0.5 text-[11px] text-gray-400'>{formatDate(notification.created_at)}</p>
        </div>

        {isSafeInternalLink(notification.link) && (
          <ChevronRight className='h-4 w-4 flex-shrink-0 text-gray-400' />
        )}
      </div>
    </Card>
  );

  if (isSafeInternalLink(notification.link)) {
    return (
      <Link href={notification.link} className='block'>
        {content}
      </Link>
    );
  }

  return content;
}
