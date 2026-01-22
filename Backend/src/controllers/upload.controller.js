/**
 * Upload Controller
 * Handles file uploads to Cloudflare R2
 * 
 * Features:
 * - Direct file upload (via multer)
 * - Presigned URL upload (for frontend direct-to-R2 upload)
 */

import { storageService } from '../services/storage.service.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { createLogger } from '../utils/logger.js';
import { canSeeFinancials } from '../utils/dataMasking.js';

const logger = createLogger('UploadController');

/**
 * Upload a single file
 * POST /upload
 * 
 * @param {Object} req.file - Multer file object
 * @param {string} req.body.folder - Optional folder path
 */
export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file provided',
    });
  }

  const folder = req.body.folder || 'uploads';

  logger.info('Uploading file', {
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    folder,
  });

  try {
    const result = await storageService.uploadFile(req.file, { folder });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype,
      },
    });

  } catch (error) {
    logger.error('Upload failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload file',
    });
  }
});

/**
 * Upload multiple files
 * POST /upload/multiple
 */
export const uploadMultipleFiles = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files provided',
    });
  }

  const folder = req.body.folder || 'uploads';
  const results = [];
  const errors = [];

  for (const file of req.files) {
    try {
      const result = await storageService.uploadFile(file, { folder });
      results.push(result);
    } catch (error) {
      errors.push({
        filename: file.originalname,
        error: error.message,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: `Uploaded ${results.length} of ${req.files.length} files`,
    data: {
      uploaded: results,
      failed: errors,
    },
  });
});

/**
 * Delete a file
 * DELETE /upload
 * 
 * @param {string} req.body.key - File key to delete
 */
export const deleteFile = asyncHandler(async (req, res) => {
  const { key, url } = req.body;
  
  const fileKey = key || storageService.extractKeyFromUrl(url);
  
  if (!fileKey) {
    return res.status(400).json({
      success: false,
      message: 'File key or URL is required',
    });
  }

  try {
    await storageService.deleteFile(fileKey);

    res.json({
      success: true,
      message: 'File deleted successfully',
    });

  } catch (error) {
    logger.error('Delete failed', { error: error.message, key: fileKey });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete file',
    });
  }
});

/**
 * Get a presigned URL for direct upload
 * POST /upload/presign
 * 
 * This allows the frontend to upload directly to R2 without
 * sending the file through our server - much faster and cheaper!
 * 
 * @param {string} req.body.filename - Original filename
 * @param {string} req.body.contentType - MIME type
 * @param {string} req.body.folder - Folder path (optional, defaults to 'receipts')
 */
export const getPresignedUploadUrl = asyncHandler(async (req, res) => {
  const { filename, contentType, folder = 'vendor-receipts' } = req.body;
  const userRole = req.user?.role;

  // Only admin/manager can upload receipts
  if (!canSeeFinancials(userRole)) {
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions to upload files',
    });
  }

  if (!filename || !contentType) {
    return res.status(400).json({
      success: false,
      message: 'Filename and contentType are required',
    });
  }

  // Validate content type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(contentType)) {
    return res.status(400).json({
      success: false,
      message: `File type '${contentType}' not allowed. Allowed: ${allowedTypes.join(', ')}`,
    });
  }

  try {
    const result = await storageService.getPresignedUploadUrl(filename, {
      folder,
      contentType,
      expiresIn: 300, // 5 minutes
    });

    logger.info('Presigned URL generated', {
      filename,
      contentType,
      folder,
      key: result.key,
    });

    res.json({
      success: true,
      data: {
        uploadUrl: result.uploadUrl,
        publicUrl: result.publicUrl,
        key: result.key,
        expiresIn: 300,
      },
    });

  } catch (error) {
    logger.error('Failed to generate presigned URL', { error: error.message });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate upload URL',
    });
  }
});

export default {
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
  getPresignedUploadUrl,
};
