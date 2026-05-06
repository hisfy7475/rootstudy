'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import {
  markAnnouncementAsRead,
  type AnnouncementWithReadStatus,
} from '@/lib/actions/announcement';
import { ChevronLeft, Star, Calendar, FileText } from 'lucide-react';

interface AnnouncementDetailViewProps {
  announcement: AnnouncementWithReadStatus;
  backHref: string;
}

function formatFullDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AnnouncementDetailView({ announcement, backHref }: AnnouncementDetailViewProps) {
  // 마운트 시 미읽음이면 한 번만 읽음 처리.
  // SSR이 아니라 클라이언트 useEffect로 두는 이유: prefetch/사전 렌더에서 발화하지 않게 하기 위함.
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (announcement.is_read) return;
    if (markedRef.current === announcement.id) return;
    markedRef.current = announcement.id;
    void markAnnouncementAsRead(announcement.id);
  }, [announcement.id, announcement.is_read]);

  return (
    <div className='space-y-4 p-4'>
      <div className='flex items-center gap-2'>
        <Link
          href={backHref}
          aria-label='목록으로'
          className='text-text-muted inline-flex h-9 w-9 items-center justify-center rounded-2xl hover:bg-gray-100'
        >
          <ChevronLeft className='h-5 w-5' />
        </Link>
        <h1 className='text-xl font-bold'>공지사항</h1>
      </div>

      <Card className='p-6'>
        <div className='mb-4 flex items-start gap-2'>
          {announcement.is_important && (
            <Star className='h-5 w-5 flex-shrink-0 fill-yellow-500 text-yellow-500' />
          )}
          <h2 className='text-xl font-bold'>{announcement.title}</h2>
        </div>

        <div className='text-text-muted mb-6 flex items-center gap-2 text-sm'>
          <Calendar className='h-4 w-4' />
          <span>{formatFullDate(announcement.created_at)}</span>
          {announcement.creator_name && (
            <>
              <span>•</span>
              <span>{announcement.creator_name}</span>
            </>
          )}
        </div>

        <div className='prose prose-sm max-w-none'>
          <p className='text-text whitespace-pre-wrap'>{announcement.content}</p>
        </div>

        {announcement.attachments && announcement.attachments.length > 0 && (
          <div className='mt-6 border-t border-gray-100 pt-4'>
            <h3 className='text-text-muted mb-2 text-sm font-semibold'>첨부파일</h3>
            <ul className='space-y-2'>
              {announcement.attachments.map((att) => (
                <li key={att.id}>
                  <a
                    href={att.file_url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-primary flex items-center gap-2 text-sm hover:underline'
                  >
                    <FileText className='h-4 w-4 flex-shrink-0' />
                    <span className='break-all'>{att.file_name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
