'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAnnouncements, type AnnouncementWithReadStatus } from '@/lib/actions/announcement';
import { Megaphone, Star, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnnouncementsClientProps {
  initialAnnouncements: AnnouncementWithReadStatus[];
  initialUnreadCount: number;
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
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function AnnouncementsClient({
  initialAnnouncements,
  initialUnreadCount,
}: AnnouncementsClientProps) {
  const [announcements, setAnnouncements] =
    useState<AnnouncementWithReadStatus[]>(initialAnnouncements);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loading, setLoading] = useState(false);

  const refreshAnnouncements = async () => {
    setLoading(true);
    try {
      const data = await getAnnouncements();
      setAnnouncements(data);
      setUnreadCount(data.filter((a) => !a.is_read).length);
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='space-y-4 p-4'>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-bold'>공지사항</h1>
          {unreadCount > 0 && (
            <p className='text-text-muted text-sm'>읽지 않은 공지 {unreadCount}개</p>
          )}
        </div>
        <Button variant='ghost' size='sm' onClick={refreshAnnouncements} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* 공지사항 목록 */}
      {announcements.length === 0 ? (
        <Card className='p-8 text-center'>
          <Megaphone className='mx-auto mb-3 h-12 w-12 text-gray-300' />
          <p className='text-text-muted'>공지사항이 없습니다</p>
        </Card>
      ) : (
        <div className='space-y-3'>
          {/* 중요 공지 */}
          {announcements
            .filter((a) => a.is_important)
            .map((announcement) => (
              <Link
                key={announcement.id}
                href={`/student/announcements/${announcement.id}`}
                className='block'
              >
                <Card
                  className={cn(
                    'cursor-pointer border-l-4 border-yellow-400 bg-yellow-50 p-4 transition-all hover:shadow-md',
                    !announcement.is_read && 'ring-primary/20 ring-2',
                  )}
                >
                  <div className='flex items-start gap-3'>
                    <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-yellow-100'>
                      <Star className='h-5 w-5 fill-yellow-600 text-yellow-600' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='mb-1 flex items-center gap-2'>
                        <span className='truncate font-semibold'>{announcement.title}</span>
                        {!announcement.is_read && (
                          <span className='bg-primary rounded-full px-2 py-0.5 text-xs font-bold text-white'>
                            NEW
                          </span>
                        )}
                      </div>
                      <p className='text-text-muted line-clamp-2 text-sm'>{announcement.content}</p>
                      <p className='mt-1 text-xs text-gray-400'>
                        {formatDate(announcement.created_at)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}

          {/* 일반 공지 */}
          {announcements
            .filter((a) => !a.is_important)
            .map((announcement) => (
              <Link
                key={announcement.id}
                href={`/student/announcements/${announcement.id}`}
                className='block'
              >
                <Card
                  className={cn(
                    'cursor-pointer p-4 transition-all hover:shadow-md',
                    !announcement.is_read && 'border-primary border-l-4',
                    announcement.is_read && 'opacity-70',
                  )}
                >
                  <div className='flex items-start gap-3'>
                    <div className='bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl'>
                      <Megaphone className='text-primary h-5 w-5' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='mb-1 flex items-center gap-2'>
                        <span className='truncate font-medium'>{announcement.title}</span>
                        {!announcement.is_read && (
                          <span className='bg-primary h-2 w-2 flex-shrink-0 rounded-full' />
                        )}
                      </div>
                      <p className='text-text-muted line-clamp-2 text-sm'>{announcement.content}</p>
                      <p className='mt-1 text-xs text-gray-400'>
                        {formatDate(announcement.created_at)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
