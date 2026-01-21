/**
 * Upload Controller
 * Handles file uploads to Cloudflare R2
 */

import { storageService } from '../services/storage.service.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { createLogger } from '../utils/logger.js';

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

export default {
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
};
