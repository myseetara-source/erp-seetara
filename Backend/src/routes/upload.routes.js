/**
 * Upload Routes
 * File upload endpoints using Multer middleware
 */

import { Router } from 'express';
import multer from 'multer';
import {
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
} from '../controllers/upload.controller.js';
// import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// =============================================================================
// MULTER CONFIGURATION
// =============================================================================

// Memory storage (files stored in buffer, then uploaded to R2)
const storage = multer.memoryStorage();

// File filter - only allow images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type '${file.mimetype}' not allowed`), false);
  }
};

// Multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 10, // Max 10 files per request
  },
});

// =============================================================================
// ROUTES
// =============================================================================

// All routes require authentication in production
// router.use(authenticate);

/**
 * @route   POST /upload
 * @desc    Upload a single file
 * @access  Authenticated users
 */
router.post('/', upload.single('file'), uploadFile);

/**
 * @route   POST /upload/multiple
 * @desc    Upload multiple files
 * @access  Authenticated users
 */
router.post('/multiple', upload.array('files', 10), uploadMultipleFiles);

/**
 * @route   DELETE /upload
 * @desc    Delete a file
 * @access  Authenticated users
 */
router.delete('/', deleteFile);

// =============================================================================
// ERROR HANDLER FOR MULTER
// =============================================================================

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.',
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files per request.',
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  
  if (error.message.includes('not allowed')) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  
  next(error);
});

export default router;
