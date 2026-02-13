'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getNotifications } from '@/lib/actions/admin';
import {
  Bell,
  Clock,
  AlertCircle,
  Calendar,
  Award,
  CheckCircle,
  XCircle,
  RefreshCw,
  Settings,
  MessageSquare,
} from 'lucide-react';
import { cn, getTodayKST } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'late' | 'absent' | 'point' | 'schedule';
  message: string;
  sent_via: string;
  sent_at: string;
  is_sent: boolean;
  parentName: string;
  studentName: string;
  studentSeatNumber: number | null;
}

interface NotificationsClientProps {
  initialNotifications: Notification[];
}

const typeConfig = {
  late: {
    label: '지각',
    icon: Clock,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
  absent: {
    label: '결석',
    icon: AlertCircle,
    color: 'text-error',
    bgColor: 'bg-error/10',
  },
  point: {
    label: '상벌점',
    icon: Award,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  schedule: {
    label: '스케줄',
    icon: Calendar,
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
};

type FilterType = 'all' | 'late' | 'absent' | 'point' | 'schedule';

export function NotificationsClient({ initialNotifications }: NotificationsClientProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(false);

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => n.type === filter);

  // 통계
  const stats = {
    total: notifications.length,
    sent: notifications.filter(n => n.is_sent).length,
    pending: notifications.filter(n => !n.is_sent).length,
    today: notifications.filter(n => {
      const today = getTodayKST();
      return n.sent_at.startsWith(today);
    }).length,
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">알림 관리</h1>
          <p className="text-text-muted mt-1">학부모에게 발송된 알림을 확인하세요</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            알림 설정
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-text-muted">전체 알림</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-text-muted">발송 완료</p>
              <p className="text-2xl font-bold">{stats.sent}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-text-muted">발송 대기</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-text-muted">오늘 알림</p>
              <p className="text-2xl font-bold">{stats.today}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 자동 알림 설정 안내 */}
      <Card className="p-6 bg-gradient-to-r from-primary/5 to-secondary/5 border-none">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">카카오 알림톡 연동 예정</h3>
            <p className="text-sm text-text-muted">
              카카오 비즈니스 채널 연동 후 지각/결석/상벌점 알림이 자동으로 학부모에게 발송됩니다.
              현재는 알림 내역만 기록됩니다.
            </p>
          </div>
        </div>
      </Card>

      {/* 알림 목록 */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">알림 내역</h2>
          <div className="flex gap-2">
            {(['all', 'late', 'absent', 'point', 'schedule'] as FilterType[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? '전체' : typeConfig[f].label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>알림 내역이 없습니다.</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const config = typeConfig[notification.type];
              const Icon = config.icon;

              return (
                <div
                  key={notification.id}
                  className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl"
                >
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
                      <span className="font-medium">
                        {notification.studentSeatNumber || '-'}번 {notification.studentName}
                      </span>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded',
                          config.bgColor,
                          config.color
                        )}
                      >
                        {config.label}
                      </span>
                      {notification.is_sent ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          발송완료
                        </span>
                      ) : (
                        <span className="text-xs text-yellow-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          대기중
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted mb-1">{notification.message}</p>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span>수신: {notification.parentName}</span>
                      <span>•</span>
                      <span>카카오톡</span>
                      <span>•</span>
                      <span>{formatDate(notification.sent_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
