/**
 * Storage API Client
 * 
 * Frontend service for uploading files to Cloudflare R2
 * via the backend upload API.
 * 
 * CDN URL: https://media.todaytrend.com.np
 * 
 * @example
 * // Upload single file
 * const result = await uploadFile(file, 'products');
 * console.log(result.url); // https://media.todaytrend.com.np/products/...
 * 
 * // Upload multiple files
 * const results = await uploadMultipleFiles(files, 'products');
 */

import apiClient from './apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimetype: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  data: UploadResult;
}

export interface MultiUploadResponse {
  success: boolean;
  message: string;
  data: {
    uploaded: UploadResult[];
    failed: Array<{ filename: string; error: string }>;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** CDN base URL for media files */
export const MEDIA_CDN_URL = 'https://media.todaytrend.com.np';

/** Allowed file types */
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

/** Max file size in bytes (10MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate file before upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `File type '${file.type}' not allowed. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}` 
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds limit of 10MB` 
    };
  }

  return { valid: true };
}

// =============================================================================
// UPLOAD FUNCTIONS
// =============================================================================

/**
 * Upload a single file to R2
 * 
 * @param file - File to upload
 * @param folder - Target folder (e.g., 'products', 'vendors', 'orders')
 * @returns Upload result with URL
 * 
 * @example
 * const result = await uploadFile(imageFile, 'products');
 * // result.url = "https://media.todaytrend.com.np/products/1234-abc-filename.jpg"
 */
export async function uploadFile(file: File, folder: string = 'uploads'): Promise<UploadResult> {
  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Create FormData
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  // Upload via API
  const response = await apiClient.post<UploadResponse>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    // Optional: track upload progress
    onUploadProgress: (progressEvent) => {
      const percentCompleted = progressEvent.total 
        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
        : 0;
      console.log(`Upload progress: ${percentCompleted}%`);
    },
  });

  if (!response.data.success) {
    throw new Error(response.data.message || 'Upload failed');
  }

  return response.data.data;
}

/**
 * Upload multiple files to R2
 * 
 * @param files - Files to upload
 * @param folder - Target folder
 * @returns Array of upload results
 */
export async function uploadMultipleFiles(
  files: File[], 
  folder: string = 'uploads'
): Promise<{ uploaded: UploadResult[]; failed: Array<{ filename: string; error: string }> }> {
  // Validate all files
  for (const file of files) {
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(`${file.name}: ${validation.error}`);
    }
  }

  // Create FormData
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  formData.append('folder', folder);

  // Upload via API
  const response = await apiClient.post<MultiUploadResponse>('/upload/multiple', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  if (!response.data.success) {
    throw new Error(response.data.message || 'Upload failed');
  }

  return response.data.data;
}

/**
 * Delete a file from R2
 * 
 * @param keyOrUrl - File key or full URL
 */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  const response = await apiClient.delete('/upload', {
    data: { 
      key: keyOrUrl.startsWith('http') ? undefined : keyOrUrl,
      url: keyOrUrl.startsWith('http') ? keyOrUrl : undefined,
    },
  });

  if (!response.data.success) {
    throw new Error(response.data.message || 'Delete failed');
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get full CDN URL from file key
 */
export function getCdnUrl(key: string): string {
  if (key.startsWith('http')) {
    return key; // Already a full URL
  }
  return `${MEDIA_CDN_URL}/${key}`;
}

/**
 * Extract file key from CDN URL
 */
export function getKeyFromUrl(url: string): string | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // Remove leading slash
  } catch {
    return url; // Assume it's already a key
  }
}

/**
 * Get image thumbnail URL (if using image transformation)
 * Note: Cloudflare Images required for actual transformation
 */
export function getThumbnailUrl(url: string, width: number = 200): string {
  // For now, return original URL
  // When Cloudflare Images is configured, use:
  // return `${url}?width=${width}`;
  return url;
}

/**
 * Predefined folder paths
 */
export const UPLOAD_FOLDERS = {
  PRODUCTS: 'products',
  VENDORS: 'vendors',
  CUSTOMERS: 'customers',
  ORDERS: 'orders',
  INVOICES: 'invoices',
  PROFILES: 'profiles',
  MISC: 'uploads',
  CUSTOMER_ADVANCES: 'customer-advances',
  VENDOR_RECEIPTS: 'vendor-receipts',
} as const;

export default {
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
  getCdnUrl,
  getKeyFromUrl,
  getThumbnailUrl,
  validateFile,
  MEDIA_CDN_URL,
  UPLOAD_FOLDERS,
};
