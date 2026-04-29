'use client';

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import type { NotificationsListResult } from '@/lib/actions/admin';
import {
  Bell,
  Clock,
  AlertCircle,
  Calendar,
  Award,
  CheckCircle,
  RefreshCw,
  Settings,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const typeConfig = {
  late: { label: '지각', icon: Clock, color: 'text-warning', bgColor: 'bg-warning/10' },
  absent: { label: '결석', icon: AlertCircle, color: 'text-error', bgColor: 'bg-error/10' },
  point: { label: '상벌점', icon: Award, color: 'text-primary', bgColor: 'bg-primary/10' },
  schedule: { label: '스케줄', icon: Calendar, color: 'text-accent', bgColor: 'bg-accent/10' },
  system: { label: '시스템', icon: Bell, color: 'text-text-muted', bgColor: 'bg-gray-100' },
} as const;

interface NotificationsClientProps {
  initialResult: NotificationsListResult;
  stats: { total: number; sent: number; pending: number; today: number };
}

export function NotificationsClient({ initialResult, stats }: NotificationsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const notifications = initialResult.rows;
  const total = initialResult.total;
  const page = initialResult.page;
  const pageSize = initialResult.pageSize;

  function refresh() {
    startTransition(() => router.refresh());
  }

  function formatDate(dateStr: string) {
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
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className='space-y-6 p-6'>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>알림 관리</h1>
          <p className='text-text-muted mt-1'>학부모에게 발송된 알림을 확인하세요</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' onClick={refresh} disabled={isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button variant='outline'>
            <Settings className='mr-2 h-4 w-4' />
            알림 설정
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl'>
              <Bell className='text-primary h-5 w-5' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>전체 알림</p>
              <p className='text-2xl font-bold'>{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-success/20 flex h-10 w-10 items-center justify-center rounded-xl'>
              <CheckCircle className='h-5 w-5 text-green-600' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>발송 완료</p>
              <p className='text-2xl font-bold'>{stats.sent}</p>
            </div>
          </div>
        </Card>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-warning/20 flex h-10 w-10 items-center justify-center rounded-xl'>
              <Clock className='h-5 w-5 text-yellow-600' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>발송 대기</p>
              <p className='text-2xl font-bold'>{stats.pending}</p>
            </div>
          </div>
        </Card>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-secondary/10 flex h-10 w-10 items-center justify-center rounded-xl'>
              <Calendar className='text-secondary h-5 w-5' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>오늘 알림</p>
              <p className='text-2xl font-bold'>{stats.today}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 자동 알림 설정 안내 */}
      <Card className='from-primary/5 to-secondary/5 border-none bg-gradient-to-r p-6'>
        <div className='flex items-start gap-4'>
          <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm'>
            <MessageSquare className='text-primary h-6 w-6' />
          </div>
          <div className='flex-1'>
            <h3 className='mb-1 font-semibold'>카카오 알림톡 연동 예정</h3>
            <p className='text-text-muted text-sm'>
              카카오 비즈니스 채널 연동 후 지각/결석/상벌점 알림이 자동으로 학부모에게 발송됩니다.
              현재는 알림 내역만 기록됩니다.
            </p>
          </div>
        </div>
      </Card>

      {/* 알림 목록 */}
      <Card className='p-6'>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-lg font-semibold'>알림 내역 ({total}건)</h2>
        </div>

        <DataTableToolbar
          searchPlaceholder='메시지로 검색...'
          filters={[
            {
              key: 'type',
              label: '유형',
              options: [
                { value: 'late', label: '지각' },
                { value: 'absent', label: '결석' },
                { value: 'point', label: '상벌점' },
                { value: 'schedule', label: '스케줄' },
                { value: 'system', label: '시스템' },
              ],
            },
          ]}
          className='mb-4'
        />

        <div className='space-y-3'>
          {notifications.length === 0 ? (
            <div className='text-text-muted py-12 text-center'>
              <Bell className='mx-auto mb-3 h-12 w-12 opacity-50' />
              <p>알림 내역이 없습니다.</p>
            </div>
          ) : (
            notifications.map((notification) => {
              const config = typeConfig[notification.type];
              const Icon = config.icon;

              return (
                <div
                  key={notification.id}
                  className='flex items-start gap-4 rounded-xl bg-gray-50 p-4'
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
                      config.bgColor,
                    )}
                  >
                    <Icon className={cn('h-5 w-5', config.color)} />
                  </div>

                  <div className='min-w-0 flex-1'>
                    <div className='mb-1 flex items-center gap-2'>
                      <span className='font-medium'>
                        {notification.studentSeatNumber || '-'}번 {notification.studentName}
                      </span>
                      <span
                        className={cn('rounded px-2 py-0.5 text-xs', config.bgColor, config.color)}
                      >
                        {config.label}
                      </span>
                      {notification.is_sent ? (
                        <span className='flex items-center gap-1 text-xs text-green-600'>
                          <CheckCircle className='h-3 w-3' />
                          발송완료
                        </span>
                      ) : (
                        <span className='flex items-center gap-1 text-xs text-yellow-600'>
                          <Clock className='h-3 w-3' />
                          대기중
                        </span>
                      )}
                    </div>
                    <p className='text-text-muted mb-1 text-sm'>{notification.message}</p>
                    <div className='text-text-muted flex items-center gap-3 text-xs'>
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

        <div className='mt-4 flex justify-center'>
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            pathname={pathname}
            searchParams={new URLSearchParams(sp.toString())}
          />
        </div>
      </Card>
    </div>
  );
}
