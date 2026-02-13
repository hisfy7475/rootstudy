'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getAnnouncementsForAdmin,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '@/lib/actions/announcement';
import {
  sendKakaoAlimtalkToParents,
  getAlimtalkConfig,
} from '@/lib/actions/notification';
import {
  Megaphone,
  Plus,
  RefreshCw,
  Users,
  GraduationCap,
  UserCircle,
  Star,
  Trash2,
  Edit,
  X,
  Eye,
  MessageCircle,
} from 'lucide-react';
import { cn, getTodayKST } from '@/lib/utils';

interface Announcement {
  id: string;
  branch_id: string | null;
  title: string;
  content: string;
  is_important: boolean;
  target_audience: 'all' | 'student' | 'parent';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  read_count: number;
  creator_name?: string;
}

interface AnnouncementsClientProps {
  initialAnnouncements: Announcement[];
  alimtalkConfigured?: boolean;
}

const audienceConfig = {
  all: {
    label: '전체',
    icon: Users,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  student: {
    label: '학생',
    icon: GraduationCap,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  parent: {
    label: '학부모',
    icon: UserCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
};

type FilterType = 'all' | 'student' | 'parent';

export function AnnouncementsClient({ initialAnnouncements, alimtalkConfigured: initialAlimtalkConfigured }: AnnouncementsClientProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initialAnnouncements);
  const [filter, setFilter] = useState<FilterType | 'show_all'>('show_all');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alimtalkConfigured, setAlimtalkConfigured] = useState(initialAlimtalkConfigured ?? false);
  const [alimtalkResult, setAlimtalkResult] = useState<{
    show: boolean;
    success: boolean;
    sentCount: number;
    failedCount: number;
    noPhoneCount: number;
  } | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    isImportant: false,
    targetAudience: 'all' as 'all' | 'student' | 'parent',
    sendNotification: true,
    sendKakaoAlimtalk: false,
  });

  // 알림톡 설정 상태 확인
  useEffect(() => {
    const checkAlimtalkConfig = async () => {
      const config = await getAlimtalkConfig();
      setAlimtalkConfigured(config.isConfigured);
    };
    if (initialAlimtalkConfigured === undefined) {
      checkAlimtalkConfig();
    }
  }, [initialAlimtalkConfigured]);

  // 대상이 학생 전용일 때 카카오 알림톡 비활성화
  const canSendKakaoAlimtalk = alimtalkConfigured && formData.targetAudience !== 'student';

  const filteredAnnouncements = filter === 'show_all'
    ? announcements
    : announcements.filter(a => a.target_audience === filter || a.target_audience === 'all');

  // 통계
  const stats = {
    total: announcements.length,
    important: announcements.filter(a => a.is_important).length,
    today: announcements.filter(a => {
      const today = getTodayKST();
      return a.created_at.startsWith(today);
    }).length,
    totalReads: announcements.reduce((sum, a) => sum + (a.read_count || 0), 0),
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      const data = await getAnnouncementsForAdmin();
      setAnnouncements(data);
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

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      title: '',
      content: '',
      isImportant: false,
      targetAudience: 'all',
      sendNotification: true,
      sendKakaoAlimtalk: false,
    });
    setAlimtalkResult(null);
    setShowModal(true);
  };

  const openEditModal = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      isImportant: announcement.is_important,
      targetAudience: announcement.target_audience,
      sendNotification: false,
      sendKakaoAlimtalk: false,
    });
    setAlimtalkResult(null);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    setLoading(true);
    setAlimtalkResult(null);
    
    try {
      if (editingId) {
        const result = await updateAnnouncement(editingId, {
          title: formData.title,
          content: formData.content,
          isImportant: formData.isImportant,
          targetAudience: formData.targetAudience,
        });
        if (result.error) {
          alert(result.error);
          return;
        }
      } else {
        const result = await createAnnouncement({
          title: formData.title,
          content: formData.content,
          isImportant: formData.isImportant,
          targetAudience: formData.targetAudience,
          sendNotification: formData.sendNotification,
        });
        if (result.error) {
          alert(result.error);
          return;
        }
      }

      // 카카오 알림톡 발송 (새 공지 생성 시에만)
      if (!editingId && formData.sendKakaoAlimtalk && canSendKakaoAlimtalk) {
        const alimtalkMessage = `[${formData.title}]\n\n${formData.content}`;
        const alimtalkRes = await sendKakaoAlimtalkToParents({
          message: alimtalkMessage,
        });
        
        setAlimtalkResult({
          show: true,
          success: alimtalkRes.success,
          sentCount: alimtalkRes.sentCount,
          failedCount: alimtalkRes.failedCount,
          noPhoneCount: alimtalkRes.noPhoneCount,
        });

        // 결과 표시 후 모달 닫지 않음 (사용자가 결과 확인 후 닫기)
        await refreshData();
        return;
      }

      setShowModal(false);
      await refreshData();
    } catch (error) {
      console.error('Failed to save:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    setLoading(true);
    try {
      const result = await deleteAnnouncement(id);
      if (result.error) {
        alert(result.error);
        return;
      }
      await refreshData();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('삭제에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">공지사항 관리</h1>
          <p className="text-text-muted mt-1">학생과 학부모에게 공지사항을 전달하세요</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" />
            새 공지
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-text-muted">전체 공지</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-text-muted">중요 공지</p>
              <p className="text-2xl font-bold">{stats.important}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-text-muted">오늘 등록</p>
              <p className="text-2xl font-bold">{stats.today}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Eye className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-text-muted">총 확인 수</p>
              <p className="text-2xl font-bold">{stats.totalReads}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 공지 목록 */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">공지사항 목록</h2>
          <div className="flex gap-2">
            {(['show_all', 'all', 'student', 'parent'] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === 'show_all' ? '전체 보기' : audienceConfig[f].label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filteredAnnouncements.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>공지사항이 없습니다.</p>
            </div>
          ) : (
            filteredAnnouncements.map((announcement) => {
              const config = audienceConfig[announcement.target_audience];
              const Icon = config.icon;

              return (
                <div
                  key={announcement.id}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-xl',
                    announcement.is_important ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                  )}
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
                      {announcement.is_important && (
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      )}
                      <span className="font-medium">{announcement.title}</span>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded',
                          config.bgColor,
                          config.color
                        )}
                      >
                        {config.label}
                      </span>
                    </div>
                    <p className="text-sm text-text-muted mb-2 line-clamp-2">{announcement.content}</p>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span>작성: {announcement.creator_name || '관리자'}</span>
                      <span>•</span>
                      <span>{formatDate(announcement.created_at)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {announcement.read_count}명 확인
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(announcement)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(announcement.id)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* 생성/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingId ? '공지사항 수정' : '새 공지사항'}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">제목</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="공지사항 제목을 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">내용</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[150px]"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="공지사항 내용을 입력하세요"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">대상</label>
                <div className="flex gap-2">
                  {(['all', 'student', 'parent'] as const).map((audience) => (
                    <Button
                      key={audience}
                      type="button"
                      variant={formData.targetAudience === audience ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormData({ ...formData, targetAudience: audience })}
                    >
                      {audienceConfig[audience].label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isImportant}
                    onChange={(e) => setFormData({ ...formData, isImportant: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">중요 공지</span>
                </label>

                {!editingId && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.sendNotification}
                        onChange={(e) => setFormData({ ...formData, sendNotification: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm">앱 내 알림 발송</span>
                    </label>

                    <label className={cn(
                      "flex items-center gap-2",
                      canSendKakaoAlimtalk ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
                    )}>
                      <input
                        type="checkbox"
                        checked={formData.sendKakaoAlimtalk}
                        onChange={(e) => setFormData({ ...formData, sendKakaoAlimtalk: e.target.checked })}
                        disabled={!canSendKakaoAlimtalk}
                        className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                      />
                      <span className="text-sm flex items-center gap-1">
                        <MessageCircle className="w-4 h-4 text-yellow-500" />
                        카카오톡 알림톡 발송
                        {formData.targetAudience === 'student' && (
                          <span className="text-xs text-text-muted">(학부모 대상만)</span>
                        )}
                        {!alimtalkConfigured && (
                          <span className="text-xs text-text-muted">(설정 필요)</span>
                        )}
                      </span>
                    </label>
                  </>
                )}
              </div>

              {/* 알림톡 발송 결과 */}
              {alimtalkResult?.show && (
                <div className={cn(
                  "p-3 rounded-lg text-sm",
                  alimtalkResult.success ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                )}>
                  <div className="flex items-center gap-2 font-medium mb-1">
                    <MessageCircle className="w-4 h-4" />
                    카카오톡 알림톡 발송 결과
                  </div>
                  <div className="space-y-1">
                    <p>발송 성공: {alimtalkResult.sentCount}건</p>
                    {alimtalkResult.failedCount > 0 && (
                      <p>발송 실패: {alimtalkResult.failedCount}건</p>
                    )}
                    {alimtalkResult.noPhoneCount > 0 && (
                      <p className="text-text-muted">전화번호 미등록: {alimtalkResult.noPhoneCount}명</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                {alimtalkResult?.show ? '닫기' : '취소'}
              </Button>
              {!alimtalkResult?.show && (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? '저장 중...' : editingId ? '수정' : '등록'}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
