'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MealImageUploaderProps {
  currentUrl: string | null | undefined;
  onUpload: (formData: FormData) => Promise<{ data?: { url: string }; error?: string }>;
  onDelete: () => Promise<{ success?: true; error?: string }>;
  className?: string;
  placeholderSrc?: string;
}

export function MealImageUploader({
  currentUrl,
  onUpload,
  onDelete,
  className,
  placeholderSrc,
}: MealImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await onUpload(fd);
      if (res.error) {
        setError(res.error);
        setPreview(currentUrl ?? null);
      } else if (res.data) {
        setPreview(res.data.url);
      }
    } catch {
      setError('업로드 중 오류가 발생했습니다.');
      setPreview(currentUrl ?? null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localPreview);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      void handleFile(file);
    }
  };

  const handleDelete = async () => {
    if (!confirm('이미지를 삭제할까요?')) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await onDelete();
      if (res.error) {
        setError(res.error);
      } else {
        setPreview(null);
      }
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const displaySrc = preview || placeholderSrc;

  return (
    <div className={cn('space-y-2', className)}>
      <label className="mb-1 block text-sm font-medium">이미지</label>

      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
          !preview && !placeholderSrc && 'min-h-[160px]',
          'cursor-pointer'
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {displaySrc ? (
          <Image
            src={displaySrc}
            alt="미리보기"
            width={400}
            height={300}
            className="h-auto max-h-[240px] w-full object-cover"
            unoptimized={displaySrc.startsWith('http') || displaySrc.startsWith('blob:')}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <ImagePlus className="size-8" />
            <span className="text-sm">클릭 또는 드래그하여 이미지 업로드</span>
            <span className="text-xs">JPG, PNG, WebP, GIF (최대 5MB)</span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
      />

      {preview && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <ImagePlus className="mr-1 size-3.5" />
            변경
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
            disabled={deleting || uploading}
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1 size-3.5" />
            )}
            삭제
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
