'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import {
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  uploadAnnouncementAttachment,
  deleteAnnouncementAttachment,
  finalizeAnnouncementNotifications,
  type AnnouncementAttachmentRow,
  type AnnouncementsListResult,
} from '@/lib/actions/announcement';
import {
  ANNOUNCEMENT_FILE_ACCEPT,
  ANNOUNCEMENT_FILE_MAX_BYTES,
  ANNOUNCEMENT_FILE_MAX_COUNT,
  isAnnouncementMimeAllowed,
} from '@/lib/announcement-config';
import { sendKakaoAlimtalkToParents, getAlimtalkConfig } from '@/lib/actions/notification';
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
  Paperclip,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Announcement = AnnouncementsListResult['rows'][number];

interface AnnouncementsClientProps {
  initialResult: AnnouncementsListResult;
  stats: { total: number; important: number; today: number; totalReads: number };
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

export function AnnouncementsClient({
  initialResult,
  stats,
  alimtalkConfigured: initialAlimtalkConfigured,
}: AnnouncementsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const announcements = initialResult.rows;
  const total = initialResult.total;
  const page = initialResult.page;
  const pageSize = initialResult.pageSize;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alimtalkConfigured, setAlimtalkConfigured] = useState(initialAlimtalkConfigured ?? false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<AnnouncementAttachmentRow[]>([]);
  // 사용자가 X로 표시한 기존 첨부 — 모달의 "수정/등록" 버튼을 눌러야 실제 DB·Storage에서 삭제된다.
  const [markedDeletedIds, setMarkedDeletedIds] = useState<string[]>([]);
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

  const refreshData = () => {
    startTransition(() => router.refresh());
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
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openCreateModal = () => {
    setEditingId(null);
    setPendingFiles([]);
    setExistingAttachments([]);
    setMarkedDeletedIds([]);
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

  const openEditModal = async (announcement: Announcement) => {
    setEditingId(announcement.id);
    setPendingFiles([]);
    setMarkedDeletedIds([]);
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
    const full = await getAnnouncementById(announcement.id);
    setExistingAttachments(full?.attachments ?? []);
  };

  // 저장 시 실제 남게 될 첨부 수 (마킹된 기존 첨부는 제외).
  const effectiveExistingCount = existingAttachments.length - markedDeletedIds.length;
  const totalAttachmentCount = effectiveExistingCount + pendingFiles.length;

  const addPendingFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...pendingFiles];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // 저장 후 실제 남을 첨부 수 + 이번 배치 누적이 한도를 넘는지 매 회 검사
      if (effectiveExistingCount + next.length >= ANNOUNCEMENT_FILE_MAX_COUNT) {
        alert(`첨부는 최대 ${ANNOUNCEMENT_FILE_MAX_COUNT}개까지입니다.`);
        break;
      }
      if (f.size > ANNOUNCEMENT_FILE_MAX_BYTES) {
        alert(`${f.name}: 20MB 이하만 첨부할 수 있습니다.`);
        continue;
      }
      // 브라우저가 MIME을 비워서 보내는 경우(드물지만 발생)에는 거부 — 서버에서도 어차피 막힌다.
      if (!isAnnouncementMimeAllowed(f.type)) {
        alert(`${f.name}: 지원하지 않는 파일 형식입니다.`);
        continue;
      }
      next.push(f);
    }
    setPendingFiles(next);
  };

  const removePendingAt = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  /** 기존 첨부를 "삭제 예정"으로 마킹만 한다. 실제 삭제는 handleSubmit에서 일괄 수행. */
  const markExistingForDeletion = (attachmentId: string) => {
    setMarkedDeletedIds((prev) => (prev.includes(attachmentId) ? prev : [...prev, attachmentId]));
  };

  /** 마킹을 되돌린다. */
  const unmarkExistingForDeletion = (attachmentId: string) => {
    setMarkedDeletedIds((prev) => prev.filter((id) => id !== attachmentId));
  };

  /**
   * 펜딩 파일을 순차 업로드.
   * 한 건이라도 실패하면 그 시점에 중단하고 그때까지 성공한 첨부 ID 목록을 함께 반환한다.
   * 호출자가 이 목록으로 롤백(deleteAnnouncementAttachment)을 수행한다.
   */
  const uploadPendingForAnnouncement = async (
    announcementId: string,
  ): Promise<{
    success: boolean;
    uploadedIds: string[];
    failure?: { fileName: string; reason: string };
  }> => {
    const uploadedIds: string[] = [];
    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append('file', file);
      const up = await uploadAnnouncementAttachment(announcementId, fd);
      if (up.error || !up.data) {
        return {
          success: false,
          uploadedIds,
          failure: { fileName: file.name, reason: up.error || '업로드 실패' },
        };
      }
      uploadedIds.push(up.data.id);
    }
    return { success: true, uploadedIds };
  };

  /** 업로드된 첨부들을 best-effort로 삭제한다 (롤백). */
  const rollbackAttachments = async (ids: string[]) => {
    for (const id of ids) {
      try {
        await deleteAnnouncementAttachment(id);
      } catch (e) {
        console.error('rollback attachment failed', id, e);
      }
    }
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
        // 수정: 기존 공지는 보존. 본문 update → 펜딩 업로드 → 마킹된 기존 첨부 일괄 삭제 순서.
        // 펜딩 업로드 실패 시 새 첨부만 롤백하고, 마킹된 기존 첨부는 손대지 않는다(보존).
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
        if (pendingFiles.length > 0) {
          const r = await uploadPendingForAnnouncement(editingId);
          if (!r.success) {
            await rollbackAttachments(r.uploadedIds);
            alert(
              `첨부 업로드 실패 (${r.failure?.fileName}): ${r.failure?.reason}\n등록된 첨부는 모두 취소되었습니다.`,
            );
            return;
          }
        }
        // 업로드까지 모두 성공한 시점에서 마킹된 기존 첨부를 일괄 삭제 (사용자가 X 누른 항목들).
        if (markedDeletedIds.length > 0) {
          for (const id of markedDeletedIds) {
            try {
              const dr = await deleteAnnouncementAttachment(id);
              if (dr.error) console.error('mark-delete failed', id, dr.error);
            } catch (e) {
              console.error('mark-delete threw', id, e);
            }
          }
          setMarkedDeletedIds([]);
        }
        if (pendingFiles.length > 0 || markedDeletedIds.length > 0) {
          setPendingFiles([]);
          const full = await getAnnouncementById(editingId);
          setExistingAttachments(full?.attachments ?? []);
        }
      } else {
        // 신규 생성: "공지 + 첨부 + 알림"을 트랜잭션 단위로 다룬다.
        // 첨부가 있으면 알림 발송을 보류하고(sendNotification:false),
        // 첨부 업로드까지 모두 성공한 뒤에만 finalize 호출로 알림 발송.
        // 첨부 실패 시: 업로드된 첨부 + 공지 자체를 모두 삭제 → 아무것도 안 만들어진 상태로 복구.
        const hasFiles = pendingFiles.length > 0;
        const userWantsNotification = formData.sendNotification;

        const result = await createAnnouncement({
          title: formData.title,
          content: formData.content,
          isImportant: formData.isImportant,
          targetAudience: formData.targetAudience,
          sendNotification: hasFiles ? false : userWantsNotification,
        });
        if (result.error) {
          alert(result.error);
          return;
        }
        const newId = result.data?.id;
        if (!newId) {
          alert('공지 ID를 받아오지 못했습니다.');
          return;
        }

        if (hasFiles) {
          const r = await uploadPendingForAnnouncement(newId);
          if (!r.success) {
            // 완전 롤백: 업로드된 첨부 → 공지 본문 순서로 삭제
            await rollbackAttachments(r.uploadedIds);
            await deleteAnnouncement(newId);
            alert(
              `첨부 업로드 실패 (${r.failure?.fileName}): ${r.failure?.reason}\n공지가 등록되지 않았습니다. 다시 시도해주세요.`,
            );
            return;
          }
          // 첨부까지 모두 성공한 시점에서 알림 발송 (사용자가 발송 옵션 켰을 때만)
          if (userWantsNotification) {
            await finalizeAnnouncementNotifications(newId);
          }
          setPendingFiles([]);
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
    <div className='space-y-6 p-6'>
      {/* 헤더 */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>공지사항 관리</h1>
          <p className='text-text-muted mt-1'>학생과 학부모에게 공지사항을 전달하세요</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' onClick={refreshData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button onClick={openCreateModal}>
            <Plus className='mr-2 h-4 w-4' />새 공지
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl'>
              <Megaphone className='text-primary h-5 w-5' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>전체 공지</p>
              <p className='text-2xl font-bold'>{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-100'>
              <Star className='h-5 w-5 text-yellow-600' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>중요 공지</p>
              <p className='text-2xl font-bold'>{stats.important}</p>
            </div>
          </div>
        </Card>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-secondary/10 flex h-10 w-10 items-center justify-center rounded-xl'>
              <Plus className='text-secondary h-5 w-5' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>오늘 등록</p>
              <p className='text-2xl font-bold'>{stats.today}</p>
            </div>
          </div>
        </Card>
        <Card className='p-4'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-green-100'>
              <Eye className='h-5 w-5 text-green-600' />
            </div>
            <div>
              <p className='text-text-muted text-sm'>총 확인 수</p>
              <p className='text-2xl font-bold'>{stats.totalReads}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 공지 목록 */}
      <Card className='p-6'>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='text-lg font-semibold'>공지사항 목록 ({total}건)</h2>
        </div>

        <DataTableToolbar
          searchPlaceholder='제목·내용으로 검색...'
          filters={[
            {
              key: 'audience',
              label: '대상',
              options: [
                { value: 'all', label: '전체' },
                { value: 'student', label: '학생' },
                { value: 'parent', label: '학부모' },
              ],
            },
            {
              key: 'important',
              label: '중요',
              options: [{ value: '1', label: '중요 공지만' }],
              allLabel: '모두',
            },
          ]}
          className='mb-4'
        />

        <div className='space-y-3'>
          {announcements.length === 0 ? (
            <div className='text-text-muted py-12 text-center'>
              <Megaphone className='mx-auto mb-3 h-12 w-12 opacity-50' />
              <p>공지사항이 없습니다.</p>
            </div>
          ) : (
            announcements.map((announcement) => {
              const config = audienceConfig[announcement.target_audience];
              const Icon = config.icon;

              return (
                <div
                  key={announcement.id}
                  className={cn(
                    'flex items-start gap-4 rounded-xl p-4',
                    announcement.is_important
                      ? 'border border-yellow-200 bg-yellow-50'
                      : 'bg-gray-50',
                  )}
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
                      {announcement.is_important && (
                        <Star className='h-4 w-4 fill-yellow-500 text-yellow-500' />
                      )}
                      <span className='font-medium'>{announcement.title}</span>
                      <span
                        className={cn('rounded px-2 py-0.5 text-xs', config.bgColor, config.color)}
                      >
                        {config.label}
                      </span>
                    </div>
                    <p className='text-text-muted mb-2 line-clamp-2 text-sm'>
                      {announcement.content}
                    </p>
                    <div className='text-text-muted flex items-center gap-3 text-xs'>
                      <span>작성: {announcement.creator_name || '관리자'}</span>
                      <span>•</span>
                      <span>{formatDate(announcement.created_at)}</span>
                      <span>•</span>
                      <span className='flex items-center gap-1'>
                        <Eye className='h-3 w-3' />
                        {announcement.read_count}명 확인
                      </span>
                    </div>
                  </div>

                  <div className='flex gap-2'>
                    <Button variant='ghost' size='sm' onClick={() => openEditModal(announcement)}>
                      <Edit className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => handleDelete(announcement.id)}
                      className='text-red-500 hover:text-red-600'
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
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

      {/* 생성/수정 모달 */}
      {showModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
          <Card className='w-full max-w-lg p-6'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-xl font-bold'>{editingId ? '공지사항 수정' : '새 공지사항'}</h2>
              <Button variant='ghost' size='sm' onClick={() => setShowModal(false)}>
                <X className='h-5 w-5' />
              </Button>
            </div>

            <div className='space-y-4'>
              <div>
                <label className='mb-1 block text-sm font-medium'>제목</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder='공지사항 제목을 입력하세요'
                />
              </div>

              <div>
                <label className='mb-1 block text-sm font-medium'>내용</label>
                <textarea
                  className='focus:ring-primary/50 min-h-[150px] w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:outline-none'
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder='공지사항 내용을 입력하세요'
                />
              </div>

              <div>
                <label className='mb-2 flex items-center gap-2 text-sm font-medium'>
                  <Paperclip className='h-4 w-4' />
                  첨부파일
                </label>
                <input
                  ref={fileInputRef}
                  type='file'
                  multiple
                  accept={ANNOUNCEMENT_FILE_ACCEPT}
                  className='hidden'
                  onChange={(e) => {
                    addPendingFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <div className='flex flex-wrap items-center gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => fileInputRef.current?.click()}
                    disabled={totalAttachmentCount >= ANNOUNCEMENT_FILE_MAX_COUNT}
                  >
                    <Paperclip className='mr-1.5 h-4 w-4' />
                    파일 선택
                  </Button>
                  <span className='text-text-muted text-xs'>
                    {totalAttachmentCount === 0
                      ? '선택된 파일 없음'
                      : `선택: ${totalAttachmentCount} / ${ANNOUNCEMENT_FILE_MAX_COUNT}개`}
                  </span>
                </div>
                <div className='mt-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs leading-relaxed'>
                  <p className='text-text-muted'>
                    <span className='font-medium text-gray-700'>지원 포맷</span>
                    {' · '}PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP, JPG/PNG/GIF/WEBP
                  </p>
                  <p className='text-text-muted mt-0.5'>
                    <span className='font-medium text-gray-700'>제한</span>
                    {' · '}파일당 20MB, 최대 {ANNOUNCEMENT_FILE_MAX_COUNT}개
                  </p>
                </div>
                {existingAttachments.length > 0 && (
                  <ul className='mt-3 space-y-1 text-sm'>
                    {existingAttachments.map((att) => {
                      const isMarkedDelete = markedDeletedIds.includes(att.id);
                      return (
                        <li
                          key={att.id}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5',
                            isMarkedDelete ? 'bg-red-50' : 'bg-gray-50',
                          )}
                        >
                          <span className='flex min-w-0 items-center gap-2 truncate'>
                            <FileText
                              className={cn(
                                'h-4 w-4 flex-shrink-0',
                                isMarkedDelete ? 'text-red-300' : 'text-text-muted',
                              )}
                            />
                            <span
                              className={cn(
                                'truncate',
                                isMarkedDelete && 'text-red-400 line-through',
                              )}
                            >
                              {att.file_name}
                            </span>
                            {isMarkedDelete && (
                              <span className='flex-shrink-0 text-xs font-medium text-red-500'>
                                삭제 예정
                              </span>
                            )}
                          </span>
                          {isMarkedDelete ? (
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              className='text-text-muted h-7 flex-shrink-0 px-2 text-xs'
                              onClick={() => unmarkExistingForDeletion(att.id)}
                            >
                              되돌리기
                            </Button>
                          ) : (
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              aria-label='첨부 삭제 표시'
                              className='h-7 w-7 flex-shrink-0 p-0 text-red-600 hover:bg-red-50'
                              onClick={() => markExistingForDeletion(att.id)}
                            >
                              <X className='h-4 w-4' />
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {pendingFiles.length > 0 && (
                  <ul className='mt-2 space-y-1 text-sm'>
                    {pendingFiles.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className='bg-primary/5 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5'
                      >
                        <span className='flex min-w-0 items-center gap-2 truncate'>
                          <FileText className='text-primary h-4 w-4 flex-shrink-0' />
                          <span className='truncate'>업로드 예정: {f.name}</span>
                        </span>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          aria-label='첨부 제거'
                          className='text-text-muted h-7 w-7 flex-shrink-0 p-0 hover:bg-gray-100'
                          onClick={() => removePendingAt(i)}
                        >
                          <X className='h-4 w-4' />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className='mb-2 block text-sm font-medium'>대상</label>
                <div className='flex gap-2'>
                  {(['all', 'student', 'parent'] as const).map((audience) => (
                    <Button
                      key={audience}
                      type='button'
                      variant={formData.targetAudience === audience ? 'default' : 'outline'}
                      size='sm'
                      onClick={() => setFormData({ ...formData, targetAudience: audience })}
                    >
                      {audienceConfig[audience].label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className='space-y-3'>
                <label className='flex cursor-pointer items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={formData.isImportant}
                    onChange={(e) => setFormData({ ...formData, isImportant: e.target.checked })}
                    className='text-primary focus:ring-primary h-4 w-4 rounded border-gray-300'
                  />
                  <span className='text-sm'>중요 공지</span>
                </label>

                {!editingId && (
                  <>
                    <label className='flex cursor-pointer items-center gap-2'>
                      <input
                        type='checkbox'
                        checked={formData.sendNotification}
                        onChange={(e) =>
                          setFormData({ ...formData, sendNotification: e.target.checked })
                        }
                        className='text-primary focus:ring-primary h-4 w-4 rounded border-gray-300'
                      />
                      <span className='text-sm'>앱 내 알림 발송</span>
                    </label>

                    <label
                      className={cn(
                        'flex items-center gap-2',
                        canSendKakaoAlimtalk ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <input
                        type='checkbox'
                        checked={formData.sendKakaoAlimtalk}
                        onChange={(e) =>
                          setFormData({ ...formData, sendKakaoAlimtalk: e.target.checked })
                        }
                        disabled={!canSendKakaoAlimtalk}
                        className='h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500'
                      />
                      <span className='flex items-center gap-1 text-sm'>
                        <MessageCircle className='h-4 w-4 text-yellow-500' />
                        카카오톡 알림톡 발송
                        {formData.targetAudience === 'student' && (
                          <span className='text-text-muted text-xs'>(학부모 대상만)</span>
                        )}
                        {!alimtalkConfigured && (
                          <span className='text-text-muted text-xs'>(설정 필요)</span>
                        )}
                      </span>
                    </label>
                  </>
                )}
              </div>

              {/* 알림톡 발송 결과 */}
              {alimtalkResult?.show && (
                <div
                  className={cn(
                    'rounded-lg p-3 text-sm',
                    alimtalkResult.success
                      ? 'bg-green-50 text-green-700'
                      : 'bg-yellow-50 text-yellow-700',
                  )}
                >
                  <div className='mb-1 flex items-center gap-2 font-medium'>
                    <MessageCircle className='h-4 w-4' />
                    카카오톡 알림톡 발송 결과
                  </div>
                  <div className='space-y-1'>
                    <p>발송 성공: {alimtalkResult.sentCount}건</p>
                    {alimtalkResult.failedCount > 0 && (
                      <p>발송 실패: {alimtalkResult.failedCount}건</p>
                    )}
                    {alimtalkResult.noPhoneCount > 0 && (
                      <p className='text-text-muted'>
                        전화번호 미등록: {alimtalkResult.noPhoneCount}명
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className='mt-6 flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setShowModal(false)}>
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
