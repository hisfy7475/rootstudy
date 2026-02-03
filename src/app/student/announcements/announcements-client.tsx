'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getAnnouncements,
  markAnnouncementAsRead,
  type AnnouncementWithReadStatus,
} from '@/lib/actions/announcement';
import {
  Megaphone,
  Star,
  ChevronLeft,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnnouncementsClientProps {
  initialAnnouncements: AnnouncementWithReadStatus[];
  initialUnreadCount: number;
}

export function AnnouncementsClient({
  initialAnnouncements,
  initialUnreadCount,
}: AnnouncementsClientProps) {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id');

  const [announcements, setAnnouncements] = useState<AnnouncementWithReadStatus[]>(initialAnnouncements);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loading, setLoading] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementWithReadStatus | null>(null);

  // URL에 id가 있으면 해당 공지 선택
  useEffect(() => {
    if (selectedId) {
      const announcement = announcements.find(a => a.id === selectedId);
      if (announcement) {
        handleSelectAnnouncement(announcement);
      }
    }
  }, [selectedId, announcements]);

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

  const handleSelectAnnouncement = async (announcement: AnnouncementWithReadStatus) => {
    setSelectedAnnouncement(announcement);

    // 읽음 처리
    if (!announcement.is_read) {
      const result = await markAnnouncementAsRead(announcement.id);
      if (result.success) {
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === announcement.id ? { ...a, is_read: true } : a))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
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
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 상세 보기
  if (selectedAnnouncement) {
    return (
      <div className="p-4 space-y-4">
        {/* 헤더 */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedAnnouncement(null)}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">공지사항</h1>
        </div>

        {/* 상세 내용 */}
        <Card className="p-6">
          <div className="flex items-start gap-2 mb-4">
            {selectedAnnouncement.is_important && (
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
            <h2 className="text-xl font-bold">{selectedAnnouncement.title}</h2>
          </div>

          <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
            <Calendar className="w-4 h-4" />
            <span>{formatFullDate(selectedAnnouncement.created_at)}</span>
            {selectedAnnouncement.creator_name && (
              <>
                <span>•</span>
                <span>{selectedAnnouncement.creator_name}</span>
              </>
            )}
          </div>

          <div className="prose prose-sm max-w-none">
            <p className="whitespace-pre-wrap text-text">
              {selectedAnnouncement.content}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // 목록 보기
  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">공지사항</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-text-muted">
              읽지 않은 공지 {unreadCount}개
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshAnnouncements}
          disabled={loading}
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* 공지사항 목록 */}
      {announcements.length === 0 ? (
        <Card className="p-8 text-center">
          <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-text-muted">공지사항이 없습니다</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* 중요 공지 */}
          {announcements.filter(a => a.is_important).map((announcement) => (
            <Card
              key={announcement.id}
              className={cn(
                'p-4 cursor-pointer transition-all hover:shadow-md border-l-4 border-yellow-400 bg-yellow-50',
                !announcement.is_read && 'ring-2 ring-primary/20'
              )}
              onClick={() => handleSelectAnnouncement(announcement)}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <Star className="w-5 h-5 text-yellow-600 fill-yellow-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold truncate">{announcement.title}</span>
                    {!announcement.is_read && (
                      <span className="px-2 py-0.5 text-xs font-bold bg-primary text-white rounded-full">
                        NEW
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-muted line-clamp-2">
                    {announcement.content}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(announcement.created_at)}
                  </p>
                </div>
              </div>
            </Card>
          ))}

          {/* 일반 공지 */}
          {announcements.filter(a => !a.is_important).map((announcement) => (
            <Card
              key={announcement.id}
              className={cn(
                'p-4 cursor-pointer transition-all hover:shadow-md',
                !announcement.is_read && 'border-l-4 border-primary',
                announcement.is_read && 'opacity-70'
              )}
              onClick={() => handleSelectAnnouncement(announcement)}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Megaphone className="w-5 h-5 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{announcement.title}</span>
                    {!announcement.is_read && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-text-muted line-clamp-2">
                    {announcement.content}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDate(announcement.created_at)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
