/**
 * Storage Service (Cloudflare R2)
 * 
 * Handles file uploads/downloads to Cloudflare R2 (S3-compatible storage)
 * Uses the Adapter Pattern - can switch to AWS S3 or other providers easily.
 * 
 * Environment Variables Required:
 * - R2_ACCOUNT_ID
 * - R2_ACCESS_KEY_ID
 * - R2_SECRET_ACCESS_KEY
 * - R2_BUCKET_NAME
 * - R2_PUBLIC_URL (optional - for public bucket access)
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createLogger } from '../utils/logger.js';
import config from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const logger = createLogger('StorageService');

// =============================================================================
// CLOUDFLARE R2 CONFIGURATION
// =============================================================================
// Production Config for Today Trend / Seetara ERP
// Bucket: erp-seetara
// Region: Asia-Pacific (APAC)
// Custom Domain: media.todaytrend.com.np
// S3 API: https://fbb29bcd4a809b804b3a08a925525d5b.r2.cloudflarestorage.com/erp-seetara
// =============================================================================

const r2Config = {
  // Use centralized config or fallback to env vars
  accountId: config.r2?.accountId || process.env.R2_ACCOUNT_ID,
  accessKeyId: config.r2?.accessKeyId || process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: config.r2?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY,
  bucketName: config.r2?.bucketName || process.env.R2_BUCKET_NAME || 'erp-seetara',
  // Custom domain for public access (Cloudflare R2 Custom Domain)
  publicUrl: config.r2?.publicUrl || process.env.R2_PUBLIC_URL || 'https://media.todaytrend.com.np',
};

// Check if R2 is configured
const isR2Configured = r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey;

let s3Client = null;

if (isR2Configured) {
  s3Client = new S3Client({
    region: 'auto', // R2 uses 'auto' region
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
  });
  logger.info('✅ Cloudflare R2 client initialized', { 
    bucket: r2Config.bucketName,
    publicUrl: r2Config.publicUrl,
  });
} else {
  logger.warn('⚠️ Cloudflare R2 not configured - uploads will return mock URLs');
  logger.warn('   Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env');
}

// =============================================================================
// STORAGE SERVICE CLASS
// =============================================================================

class StorageService {
  constructor() {
    this.client = s3Client;
    this.bucket = r2Config.bucketName;
    this.publicUrl = r2Config.publicUrl;
    this.isConfigured = isR2Configured;
  }

  /**
   * Generate unique file key
   * @param {string} originalName - Original file name
   * @param {string} folder - Folder path (e.g., 'products', 'vendors')
   * @returns {string} Unique file key
   */
  generateFileKey(originalName, folder = 'uploads') {
    const ext = path.extname(originalName).toLowerCase();
    const timestamp = Date.now();
    const uniqueId = uuidv4().split('-')[0];
    const safeName = path.basename(originalName, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 50);
    
    return `${folder}/${timestamp}-${uniqueId}-${safeName}${ext}`;
  }

  /**
   * Upload a file to R2
   * @param {Object} file - Multer file object { buffer, mimetype, originalname }
   * @param {Object} options - Upload options
   * @param {string} options.folder - Folder to upload to
   * @param {boolean} options.isPublic - Whether file should be publicly accessible
   * @returns {Promise<Object>} Upload result { url, key, size }
   */
  async uploadFile(file, options = {}) {
    const { folder = 'uploads', isPublic = true } = options;

    if (!file || !file.buffer) {
      throw new Error('Invalid file: buffer is required');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`File type '${file.mimetype}' not allowed. Allowed: ${allowedTypes.join(', ')}`);
    }

    // Max file size: 10MB
    const maxSize = 10 * 1024 * 1024;
    if (file.buffer.length > maxSize) {
      throw new Error(`File size exceeds limit of ${maxSize / 1024 / 1024}MB`);
    }

    const fileKey = this.generateFileKey(file.originalname, folder);

    // If R2 not configured, return mock URL (for development)
    if (!this.isConfigured) {
      logger.warn('R2 not configured - returning mock URL');
      return {
        url: `https://placeholder.com/${fileKey}`,
        key: fileKey,
        size: file.buffer.length,
        mimetype: file.mimetype,
        mock: true,
      };
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Make public if public URL is configured
        ...(isPublic && this.publicUrl ? { ACL: 'public-read' } : {}),
      });

      await this.client.send(command);

      // Generate URL
      let url;
      if (this.publicUrl) {
        url = `${this.publicUrl}/${fileKey}`;
      } else {
        // Generate signed URL (valid for 7 days)
        url = await this.getSignedUrl(fileKey, 7 * 24 * 60 * 60);
      }

      logger.info('File uploaded successfully', {
        key: fileKey,
        size: file.buffer.length,
        mimetype: file.mimetype,
      });

      return {
        url,
        key: fileKey,
        size: file.buffer.length,
        mimetype: file.mimetype,
      };

    } catch (error) {
      logger.error('Failed to upload file', { error: error.message, key: fileKey });
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Delete a file from R2
   * @param {string} fileKey - File key to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(fileKey) {
    if (!fileKey) {
      throw new Error('File key is required');
    }

    if (!this.isConfigured) {
      logger.warn('R2 not configured - skipping delete');
      return true;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      await this.client.send(command);

      logger.info('File deleted successfully', { key: fileKey });
      return true;

    } catch (error) {
      logger.error('Failed to delete file', { error: error.message, key: fileKey });
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get a signed URL for temporary access
   * @param {string} fileKey - File key
   * @param {number} expiresIn - Expiry time in seconds (default: 1 hour)
   * @returns {Promise<string>} Signed URL
   */
  async getSignedUrl(fileKey, expiresIn = 3600) {
    if (!this.isConfigured) {
      return `https://placeholder.com/${fileKey}`;
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;

    } catch (error) {
      logger.error('Failed to generate signed URL', { error: error.message, key: fileKey });
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Check if a file exists
   * @param {string} fileKey - File key
   * @returns {Promise<boolean>} Whether file exists
   */
  async fileExists(fileKey) {
    if (!this.isConfigured) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      await this.client.send(command);
      return true;

    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Extract file key from URL
   * @param {string} url - Full URL
   * @returns {string|null} File key or null
   */
  extractKeyFromUrl(url) {
    if (!url) return null;
    
    try {
      const urlObj = new URL(url);
      // Remove leading slash
      return urlObj.pathname.substring(1);
    } catch {
      // If not a valid URL, assume it's already a key
      return url;
    }
  }

  /**
   * Generate a presigned URL for direct upload from frontend
   * This allows clients to upload directly to R2 without going through our server
   * 
   * @param {string} filename - Original filename (can be pre-formatted by frontend)
   * @param {Object} options - Options
   * @param {string} options.folder - Folder path (e.g., 'vendor-receipts')
   * @param {string} options.contentType - MIME type
   * @param {number} options.expiresIn - URL validity in seconds (default: 300 = 5 min)
   * @returns {Promise<Object>} { uploadUrl, publicUrl, key }
   */
  async getPresignedUploadUrl(filename, options = {}) {
    const { 
      folder = 'uploads', 
      contentType = 'application/octet-stream',
      expiresIn = 300,
    } = options;

    // Generate organized path: vendor-receipts/2026/01/Bank_UmeshPvtLtd_Ref8829_20260122_a3f2.jpg
    // We keep the frontend's intelligent filename and just add a short hash for uniqueness
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const shortHash = uuidv4().split('-')[0].substring(0, 4); // 4-char hash for uniqueness
    
    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, ext);
    
    // If filename looks pre-formatted (contains underscore), preserve it
    // Otherwise, sanitize it
    const isPreFormatted = baseName.includes('_') && baseName.length > 10;
    
    let safeName;
    if (isPreFormatted) {
      // Keep the intelligent filename from frontend, just sanitize special chars
      safeName = baseName
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 50);
    } else {
      // Fallback: sanitize for random uploads
      safeName = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .substring(0, 30);
    }
    
    // Final path: vendor-receipts/2026/01/Bank_UmeshPvtLtd_Ref8829_20260122_a3f2.jpg
    const fileKey = `${folder}/${year}/${month}/${safeName}_${shortHash}${ext}`;

    // If R2 not configured, return mock URLs (for development)
    if (!this.isConfigured) {
      logger.warn('R2 not configured - returning mock presigned URL');
      return {
        uploadUrl: `https://placeholder.com/upload/${fileKey}`,
        publicUrl: `https://placeholder.com/${fileKey}`,
        key: fileKey,
        mock: true,
      };
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        ContentType: contentType,
      });

      const uploadUrl = await getS3SignedUrl(this.client, command, { expiresIn });

      // Generate public URL for viewing after upload
      const publicUrl = this.publicUrl 
        ? `${this.publicUrl}/${fileKey}`
        : uploadUrl.split('?')[0]; // Remove query params for public access

      logger.info('Presigned upload URL generated', {
        key: fileKey,
        contentType,
        expiresIn,
      });

      return {
        uploadUrl,
        publicUrl,
        key: fileKey,
      };

    } catch (error) {
      logger.error('Failed to generate presigned upload URL', { 
        error: error.message, 
        filename,
      });
      throw new Error(`Failed to generate upload URL: ${error.message}`);
    }
  }
}

export const storageService = new StorageService();
export default storageService;
