'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  ImagePlus,
  Paperclip,
  MessageSquareText,
  ChevronLeft,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { listChatTemplates, type ChatMessageTemplate } from '@/lib/actions/chat';
import { toast } from 'sonner';
import { ChatTemplateManageDialog } from './chat-template-manage-dialog';

interface ChatAttachMenuProps {
  /** 관리자만 "자주 쓰는 멘트" 항목을 노출 */
  isAdmin: boolean;
  /** 전송 중 등 전체 비활성 */
  disabled?: boolean;
  /** 이미 파일이 첨부되어 이미지 선택 불가 */
  imageDisabled?: boolean;
  /** 이미 이미지가 첨부되어 파일 선택 불가 */
  fileDisabled?: boolean;
  onPickImage: () => void;
  onPickFile: () => void;
  /** 멘트 선택 시 본문에 삽입 */
  onSelectTemplate: (content: string) => void;
}

type MenuView = 'root' | 'templates';

/**
 * 입력바 좌측의 통합 첨부 런처.
 * "+" 버튼 → 위로 펼쳐지는 메뉴(이미지 / 파일 / 자주 쓰는 멘트).
 * 멘트는 관리자에게만 노출되며, 하위 뷰 진입 시점에 listChatTemplates() 로 지연 로드한다.
 * 메뉴는 버튼(입력바 좌측 끝)에 앵커링하고 폭을 viewport 로 clamp 하여 좁은 화면에서도 넘치지 않는다.
 */
export function ChatAttachMenu({
  isAdmin,
  disabled = false,
  imageDisabled = false,
  fileDisabled = false,
  onPickImage,
  onPickFile,
  onSelectTemplate,
}: ChatAttachMenuProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('root');
  const [manageOpen, setManageOpen] = useState(false);
  const [items, setItems] = useState<ChatMessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => {
    setOpen(false);
    setView('root');
  };

  const refresh = async () => {
    setLoading(true);
    const res = await listChatTemplates();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setItems(res.data ?? []);
    setLoaded(true);
  };

  const toggleMenu = () => {
    if (open) {
      closeMenu();
      return;
    }
    setView('root');
    setOpen(true);
  };

  // 멘트 하위 뷰 진입 — 첫 진입 시 1회 로드, 이후엔 캐시 사용(다기기 동기화는 관리 다이얼로그 변경 시 refresh)
  const openTemplates = () => {
    setView('templates');
    if (!loaded) void refresh();
  };

  // 외부 클릭 / ESC 로 닫기 (메뉴 컨테이너 한 곳에서만 처리)
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) closeMenu();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className='relative' ref={containerRef}>
      <button
        type='button'
        onClick={toggleMenu}
        disabled={disabled}
        className={cn(
          'h-11 w-11 flex-shrink-0 rounded-full',
          'flex items-center justify-center',
          'transition-all duration-200',
          'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'bg-gray-200 text-gray-700',
        )}
        title='첨부'
        aria-haspopup='menu'
        aria-expanded={open}
      >
        <Plus className={cn('h-5 w-5 transition-transform duration-200', open && 'rotate-45')} />
      </button>

      {open && (
        <div
          role='menu'
          aria-label='첨부 메뉴'
          className={cn(
            'absolute bottom-full left-0 z-30 mb-2 flex max-h-[60vh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg',
            // 루트 메뉴는 텍스트 폭에 맞춰 좁게, 멘트 목록 뷰는 가독성을 위해 넓게
            view === 'root' ? 'min-w-[10rem]' : 'w-[min(20rem,calc(100vw-1.5rem))]',
          )}
        >
          {view === 'root' ? (
            <div className='py-1'>
              <button
                type='button'
                role='menuitem'
                onClick={() => {
                  onPickImage();
                  closeMenu();
                }}
                disabled={imageDisabled}
                aria-disabled={imageDisabled}
                className='flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
              >
                <ImagePlus className='text-text-muted h-5 w-5 flex-shrink-0' />
                <span className='text-text text-sm font-medium'>이미지</span>
              </button>
              <button
                type='button'
                role='menuitem'
                onClick={() => {
                  onPickFile();
                  closeMenu();
                }}
                disabled={fileDisabled}
                aria-disabled={fileDisabled}
                className='flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
              >
                <Paperclip className='text-text-muted h-5 w-5 flex-shrink-0' />
                <span className='text-text text-sm font-medium'>파일</span>
              </button>
              {isAdmin && (
                <button
                  type='button'
                  role='menuitem'
                  onClick={openTemplates}
                  className='flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50'
                >
                  <MessageSquareText className='text-text-muted h-5 w-5 flex-shrink-0' />
                  <span className='text-text flex-1 text-sm font-medium whitespace-nowrap'>
                    자주 쓰는 멘트
                  </span>
                  <span className='text-text-muted text-xs'>›</span>
                </button>
              )}
            </div>
          ) : (
            <>
              <div className='flex items-center justify-between border-b border-gray-100 px-2 py-2'>
                <button
                  type='button'
                  onClick={() => setView('root')}
                  className='text-text flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold hover:bg-gray-100'
                  aria-label='뒤로'
                >
                  <ChevronLeft className='h-4 w-4' />
                  자주 쓰는 멘트
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setManageOpen(true);
                    closeMenu();
                  }}
                  className='text-text-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-gray-100'
                >
                  <Settings2 className='h-3.5 w-3.5' />
                  관리
                </button>
              </div>

              <div className='flex-1 overflow-y-auto py-1'>
                {loading ? (
                  <div className='text-text-muted px-3 py-6 text-center text-sm'>불러오는 중…</div>
                ) : items.length === 0 ? (
                  <div className='text-text-muted px-3 py-6 text-center text-sm'>
                    자주 쓰는 멘트가 없습니다.
                    <br />
                    관리에서 추가해보세요.
                  </div>
                ) : (
                  items.map((t) => (
                    <button
                      key={t.id}
                      type='button'
                      onClick={() => {
                        onSelectTemplate(t.content);
                        closeMenu();
                      }}
                      className='block w-full px-3 py-2 text-left hover:bg-gray-50'
                    >
                      <div className='text-text truncate text-sm font-medium'>{t.title}</div>
                      <div className='text-text-muted line-clamp-2 text-xs whitespace-pre-wrap'>
                        {t.content}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {manageOpen && (
        <ChatTemplateManageDialog
          onClose={() => setManageOpen(false)}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  );
}
