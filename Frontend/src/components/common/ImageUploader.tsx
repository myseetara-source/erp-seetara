'use client';

/**
 * ImageUploader Component
 * 
 * Reusable image upload component with:
 * - Drag & drop support
 * - Preview with remove button
 * - Progress indicator
 * - Validation feedback
 * 
 * Uploads to Cloudflare R2 via backend API.
 * CDN: https://media.todaytrend.com.np
 * 
 * @example
 * <ImageUploader
 *   value={imageUrl}
 *   onChange={(url) => setImageUrl(url)}
 *   folder="products"
 * />
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  uploadFile, 
  deleteFile, 
  validateFile, 
  MEDIA_CDN_URL,
  MAX_FILE_SIZE 
} from '@/lib/api/storage';

// =============================================================================
// TYPES
// =============================================================================

interface ImageUploaderProps {
  /** Current image URL */
  value?: string | null;
  /** Called when image is uploaded or removed */
  onChange: (url: string | null, key?: string) => void;
  /** Upload folder path */
  folder?: string;
  /** Custom placeholder text */
  placeholder?: string;
  /** Whether uploader is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Max file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Aspect ratio for preview (e.g., "1/1", "16/9") */
  aspectRatio?: string;
  /** Show delete button */
  showDelete?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ImageUploader({
  value,
  onChange,
  folder = 'uploads',
  placeholder = 'Click or drag to upload',
  disabled = false,
  className,
  maxSize = MAX_FILE_SIZE,
  aspectRatio = '1/1',
  showDelete = true,
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handle file selection
   */
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    
    // Validate
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    if (file.size > maxSize) {
      setError(`File size exceeds ${(maxSize / 1024 / 1024).toFixed(0)}MB limit`);
      return;
    }

    // Upload
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadFile(file, folder);
      onChange(result.url, result.key);
      setUploadProgress(100);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [folder, maxSize, onChange]);

  /**
   * Handle file input change
   */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFile]);

  /**
   * Handle drag events
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [disabled, handleFile]);

  /**
   * Handle remove
   */
  const handleRemove = useCallback(async () => {
    if (!value) return;

    try {
      // Optionally delete from R2 (uncomment if you want to delete)
      // await deleteFile(value);
      onChange(null);
    } catch (err) {
      console.error('Failed to delete file:', err);
      // Still remove from form even if delete fails
      onChange(null);
    }
  }, [value, onChange]);

  /**
   * Trigger file input click
   */
  const handleClick = useCallback(() => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, isUploading]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className={cn('w-full', className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Upload area or preview */}
      {value ? (
        // Preview Mode
        <div className="relative group">
          <div 
            className="overflow-hidden rounded-lg border bg-gray-50"
            style={{ aspectRatio }}
          >
            <img
              src={value}
              alt="Uploaded image"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback for broken images
                (e.target as HTMLImageElement).src = 'https://placehold.co/400x400?text=Image+Not+Found';
              }}
            />
          </div>
          
          {/* Remove button */}
          {showDelete && !disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {/* Change button */}
          {!disabled && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleClick}
            >
              Change
            </Button>
          )}
        </div>
      ) : (
        // Upload Mode
        <div
          onClick={handleClick}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-3 p-6',
            'border-2 border-dashed rounded-lg transition-colors cursor-pointer',
            'hover:border-orange-400 hover:bg-orange-50/50',
            isDragging && 'border-orange-500 bg-orange-50',
            disabled && 'opacity-50 cursor-not-allowed hover:border-gray-300 hover:bg-transparent',
            error && 'border-red-300 bg-red-50/50',
          )}
          style={{ aspectRatio }}
        >
          {isUploading ? (
            // Loading state
            <>
              <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
              <p className="text-sm text-gray-600">Uploading... {uploadProgress}%</p>
            </>
          ) : (
            // Default state
            <>
              {error ? (
                <AlertCircle className="h-10 w-10 text-red-500" />
              ) : (
                <div className="p-3 bg-orange-100 rounded-full">
                  <Upload className="h-6 w-6 text-orange-600" />
                </div>
              )}
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">
                  {error || placeholder}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  JPEG, PNG, GIF, WebP • Max {(maxSize / 1024 / 1024).toFixed(0)}MB
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error message (when there's an image but upload failed) */}
      {error && value && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// EXPORT VARIANTS
// =============================================================================

/**
 * Product Image Uploader (Square aspect ratio)
 */
export function ProductImageUploader(props: Omit<ImageUploaderProps, 'folder' | 'aspectRatio'>) {
  return (
    <ImageUploader
      {...props}
      folder="products"
      aspectRatio="1/1"
      placeholder="Upload product image"
    />
  );
}

/**
 * Banner/Cover Image Uploader (16:9 aspect ratio)
 */
export function BannerImageUploader(props: Omit<ImageUploaderProps, 'folder' | 'aspectRatio'>) {
  return (
    <ImageUploader
      {...props}
      folder="banners"
      aspectRatio="16/9"
      placeholder="Upload banner image"
    />
  );
}

/**
 * Avatar/Profile Image Uploader (Circle)
 */
export function AvatarUploader(props: Omit<ImageUploaderProps, 'folder' | 'aspectRatio' | 'className'>) {
  return (
    <div className="w-24 h-24">
      <ImageUploader
        {...props}
        folder="profiles"
        aspectRatio="1/1"
        className="[&>div]:rounded-full"
        placeholder=""
      />
    </div>
  );
}

// Default export for backwards compatibility
export default ImageUploader;
