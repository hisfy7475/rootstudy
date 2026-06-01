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
  GraduationCap,
  UserCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const typeConfig = {
  late: { label: '지각', icon: Clock, color: 'text-warning', bgColor: 'bg-warning/10' },
  absent: { label: '결석', icon: AlertCircle, color: 'text-error', bgColor: 'bg-error/10' },
  point: { label: '상벌점', icon: Award, color: 'text-primary', bgColor: 'bg-primary/10' },
  schedule: { label: '스케줄', icon: Calendar, color: 'text-accent', bgColor: 'bg-accent/10' },
  system: { label: '시스템', icon: Bell, color: 'text-text-muted', bgColor: 'bg-gray-100' },
} as const;

const recipientConfig = {
  student: { label: '학생', icon: GraduationCap, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  parent: { label: '학부모', icon: UserCircle, color: 'text-green-600', bgColor: 'bg-green-100' },
} as const;

interface NotificationsClientProps {
  initialResult: NotificationsListResult;
  stats: { total: number; read: number; unread: number; today: number };
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
          <p className='text-text-muted mt-1'>학생·학부모에게 발송된 인앱/푸시 알림 내역입니다.</p>
        </div>
        <Button variant='outline' onClick={refresh} disabled={isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
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
              <p className='text-text-muted text-sm'>읽음</p>
              <p className='text-2xl font-bold'>{stats.read}</p>
            </div>
          </div>
        </Card>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-warning/20 flex h-10 w-10 items-center justify-center rounded-xl'>
              <Clock className='h-5 w-5 text-yellow-600' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>안 읽음</p>
              <p className='text-2xl font-bold'>{stats.unread}</p>
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

      {/* 알림 목록 */}
      <Card className='p-6'>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-lg font-semibold'>알림 내역 ({total}건)</h2>
        </div>

        <DataTableToolbar
          searchPlaceholder='제목·내용으로 검색...'
          filters={[
            {
              key: 'period',
              label: '기간',
              allLabel: '최근 7일',
              options: [
                { value: '30d', label: '최근 30일' },
                { value: 'all', label: '전체 기간' },
              ],
            },
            {
              key: 'recipientType',
              label: '수신자',
              options: [
                { value: 'student', label: '학생' },
                { value: 'parent', label: '학부모' },
              ],
            },
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
              const config = typeConfig[notification.type] ?? typeConfig.system;
              const recipient = recipientConfig[notification.recipient_type];
              const RecipientIcon = recipient.icon;

              return (
                <div
                  key={notification.row_key}
                  className='flex items-start gap-4 rounded-xl bg-gray-50 p-4'
                >
                  <div className='min-w-0 flex-1'>
                    <div className='mb-1 flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>{notification.title}</span>
                      <span
                        className={cn('rounded px-2 py-0.5 text-xs', config.bgColor, config.color)}
                      >
                        {config.label}
                      </span>
                      {notification.is_read ? (
                        <span className='flex items-center gap-1 text-xs text-green-600'>
                          <CheckCircle className='h-3 w-3' />
                          읽음
                        </span>
                      ) : (
                        <span className='flex items-center gap-1 text-xs text-yellow-600'>
                          <Clock className='h-3 w-3' />안 읽음
                        </span>
                      )}
                    </div>
                    <p className='text-text-muted mb-1 text-sm'>{notification.message}</p>
                    <div className='text-text-muted flex flex-wrap items-center gap-2 text-xs'>
                      <span
                        className={cn(
                          'flex items-center gap-1 rounded px-2 py-0.5',
                          recipient.bgColor,
                          recipient.color,
                        )}
                      >
                        <RecipientIcon className='h-3 w-3' />
                        {recipient.label}
                      </span>
                      <span>
                        {notification.recipient_seat_number != null
                          ? `${notification.recipient_seat_number}번 `
                          : ''}
                        {notification.recipient_name}
                      </span>
                      <span>•</span>
                      <span>{formatDate(notification.created_at)}</span>
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
