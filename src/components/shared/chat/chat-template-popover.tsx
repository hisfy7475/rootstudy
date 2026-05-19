'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquareText, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listChatTemplates, type ChatMessageTemplate } from '@/lib/actions/chat';
import { toast } from 'sonner';
import { ChatTemplateManageDialog } from './chat-template-manage-dialog';

interface ChatTemplatePopoverProps {
  /** 본문에 삽입될 때 호출 */
  onSelect: (content: string) => void;
}

/**
 * 관리자만 노출되는 자주 쓰는 멘트 Popover.
 * 다중 디바이스 동기화를 위해 열릴 때마다 listChatTemplates() 로 재조회한다.
 */
export function ChatTemplatePopover({ onSelect }: ChatTemplatePopoverProps) {
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [items, setItems] = useState<ChatMessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    setLoading(true);
    const res = await listChatTemplates();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setItems(res.data ?? []);
  };

  const togglePopover = () => {
    // setState updater 함수 안에서 서버 액션을 호출하면 Next.js Router 가
    // 렌더 도중 업데이트되어 "Cannot update a component while rendering"
    // 에러가 난다. open 다음 상태를 동기적으로 계산해 updater 밖에서 fetch.
    const next = !open;
    setOpen(next);
    if (next) void refresh();
  };

  // 외부 클릭/ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
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
        onClick={togglePopover}
        className={cn(
          'h-11 w-11 flex-shrink-0 rounded-full',
          'flex items-center justify-center',
          'transition-all duration-200',
          'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
        )}
        title='자주 쓰는 멘트'
        aria-haspopup='dialog'
        aria-expanded={open}
      >
        <MessageSquareText className='h-5 w-5' />
      </button>

      {open && (
        <div
          role='dialog'
          aria-label='자주 쓰는 멘트'
          className='absolute bottom-12 left-0 z-30 flex max-h-[60vh] w-[min(20rem,90vw)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg'
        >
          <div className='flex items-center justify-between border-b border-gray-100 px-3 py-2'>
            <span className='text-text text-sm font-semibold'>자주 쓰는 멘트</span>
            <button
              type='button'
              onClick={() => {
                setManageOpen(true);
                setOpen(false);
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
                    onSelect(t.content);
                    setOpen(false);
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
