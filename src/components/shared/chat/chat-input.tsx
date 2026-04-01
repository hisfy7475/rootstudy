'use client';

import { useState, useRef, KeyboardEvent, ClipboardEvent, ChangeEvent } from 'react';
import { Send, ImagePlus, Paperclip, X } from 'lucide-react';
import { cn, isNativeApp } from '@/lib/utils';
import { postToNative } from '@/lib/native-bridge';
import Image from 'next/image';

interface ChatInputProps {
  roomId: string;
  onSend: (message: string, imageFile?: File | null, dataFile?: File | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB (ROADMAP Phase 4)
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
  const isNative = typeof window !== 'undefined' && isNativeApp();

  const handleImageSelect = (file: File) => {
    // 파일 타입 검증
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert('지원하지 않는 이미지 형식입니다. (JPEG, PNG, GIF, WebP만 가능)');
      return;
    }

    // 파일 크기 검증
    if (file.size > MAX_IMAGE_SIZE) {
      alert('이미지 크기는 10MB 이하여야 합니다.');
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

  const MAX_DATA_FILE_SIZE = 20 * 1024 * 1024;

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
    if (file.size > MAX_DATA_FILE_SIZE) {
      alert('파일 크기는 20MB 이하여야 합니다.');
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
      postToNative({ type: 'PICK_FILE', payload: { roomId } });
      return;
    }
    dataFileInputRef.current?.click();
  };

  const openImagePicker = () => {
    if (isNative) {
      postToNative({ type: 'PICK_IMAGE', payload: { source: 'gallery', roomId } });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleSend = () => {
    if ((message.trim() || selectedImage || selectedDataFile) && !disabled) {
      onSend(message.trim(), selectedImage, selectedDataFile);
      setMessage('');
      clearImage();
      clearDataFile();
      // 텍스트영역 높이 리셋
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter로 전송 (Shift+Enter는 줄바꿈)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 텍스트영역 자동 높이 조절
  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  };

  const canSend = (message.trim() || selectedImage || selectedDataFile) && !disabled;

  return (
    <div className="border-t border-gray-200 bg-white p-3">
      {selectedDataFile && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-text">
          <Paperclip className="w-4 h-4 flex-shrink-0 text-text-muted" />
          <span className="flex-1 truncate">{selectedDataFile.name}</span>
          <button
            type="button"
            onClick={clearDataFile}
            className="p-1 rounded-full hover:bg-gray-200"
            aria-label="첨부 취소"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 이미지 미리보기 */}
      {imagePreview && (
        <div className="mb-3 relative inline-block">
          <div className="relative rounded-xl overflow-hidden border border-gray-200">
            <Image
              src={imagePreview}
              alt="선택된 이미지"
              width={120}
              height={120}
              className="object-cover"
              style={{ width: 120, height: 120 }}
            />
            <button
              onClick={clearImage}
              className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* 이미지 업로드 버튼 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={dataFileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,application/zip"
          onChange={handleDataFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={openImagePicker}
          disabled={disabled || !!selectedDataFile}
          className={cn(
            'flex-shrink-0 w-11 h-11 rounded-full',
            'flex items-center justify-center',
            'transition-all duration-200',
            'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          title="이미지 첨부"
        >
          <ImagePlus className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={openDataFilePicker}
          disabled={disabled || !!selectedImage}
          className={cn(
            'flex-shrink-0 w-11 h-11 rounded-full',
            'flex items-center justify-center',
            'transition-all duration-200',
            'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          title="파일 첨부 (PDF·문서 등)"
        >
          <Paperclip className="w-5 h-5" />
        </button>

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
            'px-4 py-3 text-base text-text',
            'placeholder:text-text-muted',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent focus:bg-white',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'max-h-[120px]'
          )}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'flex-shrink-0 w-11 h-11 rounded-full',
            'flex items-center justify-center',
            'transition-all duration-200',
            canSend
              ? 'bg-primary text-white hover:bg-primary/90 shadow-sm'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          )}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
      <p className="text-xs text-text-muted mt-2 px-1">
        Enter로 전송, Shift+Enter로 줄바꿈, 클립보드에서 이미지 붙여넣기 가능
      </p>
    </div>
  );
}
