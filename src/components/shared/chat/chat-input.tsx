'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = '메시지를 입력하세요...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
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

  return (
    <div className="border-t border-gray-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
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
          disabled={disabled || !message.trim()}
          className={cn(
            'flex-shrink-0 w-11 h-11 rounded-full',
            'flex items-center justify-center',
            'transition-all duration-200',
            message.trim() && !disabled
              ? 'bg-primary text-white hover:bg-primary/90 shadow-sm'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          )}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
      <p className="text-xs text-text-muted mt-2 px-1">
        Enter로 전송, Shift+Enter로 줄바꿈
      </p>
    </div>
  );
}
