'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
  Settings,
  Check,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

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

interface MyNotificationsProps {
  initialNotifications: UserNotification[];
  initialUnreadCount: number;
  userId: string | null;
  pageSize: number;
}

// 페이지 표시와 일관: 화면에 올라온 항목 중 미읽음 수.
function countUnread(items: UserNotification[]): number {
  return items.filter((n) => !n.is_read).length;
}

function isSafeInternalLink(link: string | null | undefined): link is string {
  return typeof link === 'string' && link.startsWith('/');
}

const typeConfig = {
  late: { label: '지각', icon: Clock, color: 'text-warning', bgColor: 'bg-warning/10' },
  absent: { label: '결석', icon: AlertCircle, color: 'text-error', bgColor: 'bg-error/10' },
  point: { label: '상벌점', icon: Award, color: 'text-primary', bgColor: 'bg-primary/10' },
  schedule: { label: '스케줄', icon: Calendar, color: 'text-accent', bgColor: 'bg-accent/10' },
  system: { label: '시스템', icon: Settings, color: 'text-text-muted', bgColor: 'bg-gray-100' },
  chat: { label: '채팅', icon: Bell, color: 'text-secondary', bgColor: 'bg-secondary/10' },
} as const;

export function MyNotifications({
  initialNotifications,
  initialUnreadCount,
  userId,
  pageSize,
}: MyNotificationsProps) {
  const [notifications, setNotifications] = useState<UserNotification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialNotifications.length >= pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = (await getUserNotifications({
        limit: pageSize,
        offset: 0,
        excludeTypes: ['chat'],
      })) as UserNotification[];
      setNotifications(data);
      setUnreadCount(countUnread(data));
      setHasMore(data.length >= pageSize);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    const result = await markUserNotificationAsRead(id);
    if (result.success) {
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(countUnread(next));
        return next;
      });
    }
  };

  const handleMarkAllAsRead = async () => {
    const result = await markAllUserNotificationsAsRead();
    if (result.success) {
      setNotifications((prev) => {
        const next = prev.map((n) => ({ ...n, is_read: true }));
        setUnreadCount(0);
        return next;
      });
    }
  };

  // realtime — sidebar.tsx 패턴(setAuth 후 subscribe). 채널명은 사이드바와 분리.
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
        .channel(`admin-notif-page-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            // chat type 은 이 페이지에서 제외(별도 채팅 메뉴가 담당).
            const newRow = payload.new as UserNotification | undefined;
            if (newRow?.type === 'chat') return;
            setNotifications((prev) => {
              let next = prev;
              if (payload.eventType === 'INSERT') {
                if (newRow && !prev.some((n) => n.id === newRow.id)) next = [newRow, ...prev];
              } else if (payload.eventType === 'UPDATE') {
                if (newRow) next = prev.map((n) => (n.id === newRow.id ? newRow : n));
              } else if (payload.eventType === 'DELETE') {
                const old = payload.old as { id?: string };
                if (old?.id) next = prev.filter((n) => n.id !== old.id);
              }
              setUnreadCount(countUnread(next));
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
      const rows = (await getUserNotifications({
        limit: pageSize,
        offset: notifications.length,
        excludeTypes: ['chat'],
      })) as UserNotification[];
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
      if (entries.some((e) => e.isIntersecting)) void loadMore();
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
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
    });
  };

  const grouped = {
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
    if (date >= todayStart) grouped.today.push(n);
    else if (date >= weekStart) grouped.thisWeek.push(n);
    else grouped.older.push(n);
  });

  const sections: { key: string; label: string; items: UserNotification[] }[] = [
    { key: 'today', label: '오늘', items: grouped.today },
    { key: 'thisWeek', label: '이번 주', items: grouped.thisWeek },
    { key: 'older', label: '이전', items: grouped.older },
  ];

  return (
    <Card className='p-6'>
      <div className='mb-4 flex items-center justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>내 알림</h2>
          <p className='text-text-muted mt-0.5 text-sm'>
            {unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : '읽지 않은 알림이 없습니다.'}
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' size='sm' onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            새로고침
          </Button>
          {unreadCount > 0 && (
            <Button variant='outline' size='sm' onClick={handleMarkAllAsRead}>
              <Check className='mr-1.5 h-4 w-4' />
              모두 읽음
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className='text-text-muted py-12 text-center'>
          <Bell className='mx-auto mb-3 h-12 w-12 opacity-50' />
          <p>받은 알림이 없습니다.</p>
        </div>
      ) : (
        <div className='space-y-6'>
          {sections
            .filter((s) => s.items.length > 0)
            .map((s) => (
              <div key={s.key}>
                <h3 className='text-text-muted mb-2 px-1 text-sm font-medium'>{s.label}</h3>
                <div className='space-y-2'>
                  {s.items.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onMarkAsRead={handleMarkAsRead}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            ))}
          {hasMore && (
            <div ref={sentinelRef} className='flex h-8 items-center justify-center'>
              {loadingMore && <RefreshCw className='text-text-muted h-4 w-4 animate-spin' />}
            </div>
          )}
        </div>
      )}
    </Card>
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
    if (!notification.is_read) onMarkAsRead(notification.id);
  };

  const content = (
    <div
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3 transition-all hover:border-gray-300 hover:shadow-sm',
        notification.is_read && 'opacity-70',
      )}
      onClick={handleClick}
    >
      <div
        className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
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
        <ChevronRight className='h-4 w-4 flex-shrink-0 self-center text-gray-400' />
      )}
    </div>
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
