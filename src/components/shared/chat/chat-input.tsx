'use client';

import { useState, useRef, KeyboardEvent, ClipboardEvent, ChangeEvent } from 'react';
import { Send, ImagePlus, Paperclip, X } from 'lucide-react';
import { cn, isNativeApp, randomUUID } from '@/lib/utils';
import { postToNative } from '@/lib/native-bridge';
import {
  ATTACHMENT_FILE_ACCEPT,
  ATTACHMENT_FILE_MAX_BYTES,
  ATTACHMENT_IMAGE_MAX_BYTES,
  resolveAttachmentFileMime,
} from '@shared/uploads/attachments';
import Image from 'next/image';
import { ChatTemplatePopover } from './chat-template-popover';

interface ChatInputProps {
  roomId: string;
  onSend: (
    message: string,
    imageFile: File | null,
    dataFile: File | null,
    clientId: string,
  ) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export function ChatInput({
  roomId,
  onSend,
  disabled = false,
  placeholder = '메시지를 입력하세요...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedDataFile, setSelectedDataFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataFileInputRef = useRef<HTMLInputElement>(null);
  // 같은 tick 안에 도착한 두 번째 Enter / 더블클릭이 onSend 를 두 번 호출하지 않도록
  // React state 와 무관하게 동기적으로 막는 가드. disabled prop 은 부모의 setIsSending
  // 전파를 거치므로 같은 tick 에는 의지할 수 없다.
  const inFlightRef = useRef(false);
  const isNative = typeof window !== 'undefined' && isNativeApp();

  const handleImageSelect = (file: File) => {
    // 파일 타입 검증
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert('지원하지 않는 이미지 형식입니다. (JPEG, PNG, GIF, WebP만 가능)');
      return;
    }

    // 파일 크기 검증
    if (file.size > ATTACHMENT_IMAGE_MAX_BYTES) {
      alert('이미지 크기는 50MB 이하여야 합니다.');
      return;
    }

    setSelectedDataFile(null);
    setSelectedImage(file);

    // 미리보기 생성
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
    // input 초기화 (같은 파일 다시 선택 가능하도록)
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleImageSelect(file);
        }
        break;
      }
    }
  };

  const handleDataFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (dataFileInputRef.current) {
      dataFileInputRef.current.value = '';
    }
    if (!file) return;
    if (file.type.startsWith('image/')) {
      alert('이미지는 이미지 첨부 버튼을 사용해 주세요.');
      return;
    }
    if (!resolveAttachmentFileMime(file.type, file.name)) {
      alert('지원하지 않는 파일 형식입니다. (PDF, Office 문서, TXT, CSV, ZIP 등)');
      return;
    }
    if (file.size > ATTACHMENT_FILE_MAX_BYTES) {
      alert('파일 크기는 50MB 이하여야 합니다.');
      return;
    }
    clearImage();
    setSelectedDataFile(file);
  };

  const clearDataFile = () => setSelectedDataFile(null);

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const openDataFilePicker = () => {
    if (isNative) {
      postToNative({ type: 'PICK_FILE', payload: { context: 'chat', roomId } });
      return;
    }
    dataFileInputRef.current?.click();
  };

  const openImagePicker = () => {
    if (isNative) {
      postToNative({ type: 'PICK_IMAGE', payload: { source: 'gallery', context: 'chat', roomId } });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleSend = async () => {
    if (inFlightRef.current) return;
    if (!(message.trim() || selectedImage || selectedDataFile) || disabled) return;
    inFlightRef.current = true;
    try {
      const clientId = randomUUID();
      await onSend(message.trim(), selectedImage, selectedDataFile, clientId);
      setMessage('');
      clearImage();
      clearDataFile();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    // 한글/일본어/중국어 IME 조합 확정용 Enter 는 발송 트리거가 아니다.
    // keyCode 229 는 IME 가 키 처리 중임을 나타내는 표준 sentinel.
    if (
      e.nativeEvent.isComposing ||
      (e.nativeEvent as unknown as { keyCode?: number }).keyCode === 229
    ) {
      return;
    }
    e.preventDefault();
    void handleSend();
  };

  // 텍스트영역 자동 높이 조절
  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const canSend = (message.trim() || selectedImage || selectedDataFile) && !disabled;

  // 템플릿 선택 시 본문에 채워넣고 textarea 포커스 + 커서 끝으로
  const insertTemplate = (content: string) => {
    setMessage((prev) => (prev.trim() ? `${prev}\n${content}` : content));
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    });
  };

  return (
    <div className='border-t border-gray-200 bg-white p-3'>
      {selectedDataFile && (
        <div className='text-text mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm'>
          <Paperclip className='text-text-muted h-4 w-4 flex-shrink-0' />
          <span className='flex-1 truncate'>{selectedDataFile.name}</span>
          <button
            type='button'
            onClick={clearDataFile}
            className='rounded-full p-1 hover:bg-gray-200'
            aria-label='첨부 취소'
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      )}

      {/* 이미지 미리보기 */}
      {imagePreview && (
        <div className='relative mb-3 inline-block'>
          <div className='relative overflow-hidden rounded-xl border border-gray-200'>
            <Image
              src={imagePreview}
              alt='선택된 이미지'
              width={120}
              height={120}
              className='object-cover'
              style={{ width: 120, height: 120 }}
            />
            <button
              onClick={clearImage}
              className='absolute top-1 right-1 rounded-full bg-black/50 p-1 transition-colors hover:bg-black/70'
            >
              <X className='h-4 w-4 text-white' />
            </button>
          </div>
        </div>
      )}

      <div className='flex items-end gap-2'>
        {/* 이미지 업로드 버튼 */}
        <input
          ref={fileInputRef}
          type='file'
          accept='image/jpeg,image/png,image/gif,image/webp'
          onChange={handleFileChange}
          className='hidden'
        />
        <input
          ref={dataFileInputRef}
          type='file'
          accept={ATTACHMENT_FILE_ACCEPT}
          onChange={handleDataFileChange}
          className='hidden'
        />
        <button
          type='button'
          onClick={openImagePicker}
          disabled={disabled || !!selectedDataFile}
          className={cn(
            'h-11 w-11 flex-shrink-0 rounded-full',
            'flex items-center justify-center',
            'transition-all duration-200',
            'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          title='이미지 첨부'
        >
          <ImagePlus className='h-5 w-5' />
        </button>

        <button
          type='button'
          onClick={openDataFilePicker}
          disabled={disabled || !!selectedImage}
          className={cn(
            'h-11 w-11 flex-shrink-0 rounded-full',
            'flex items-center justify-center',
            'transition-all duration-200',
            'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          title='파일 첨부 (PDF·문서 등)'
        >
          <Paperclip className='h-5 w-5' />
        </button>

        <ChatTemplatePopover onSelect={insertTemplate} />

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            selectedImage
              ? '이미지와 함께 보낼 메시지 (선택)'
              : selectedDataFile
                ? '파일과 함께 보낼 메시지 (선택)'
                : placeholder
          }
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50',
            'text-text px-4 py-3 text-base',
            'placeholder:text-text-muted',
            'transition-all duration-200',
            'focus:ring-primary focus:border-transparent focus:bg-white focus:ring-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'max-h-[120px]',
          )}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!canSend}
          className={cn(
            'h-11 w-11 flex-shrink-0 rounded-full',
            'flex items-center justify-center',
            'transition-all duration-200',
            canSend
              ? 'bg-primary hover:bg-primary/90 text-white shadow-sm'
              : 'cursor-not-allowed bg-gray-200 text-gray-400',
          )}
        >
          <Send className='h-5 w-5' />
        </button>
      </div>
      <p className='text-text-muted mt-2 px-1 text-xs'>
        Enter로 전송, Shift+Enter로 줄바꿈, 클립보드에서 이미지 붙여넣기 가능
      </p>
    </div>
  );
}
