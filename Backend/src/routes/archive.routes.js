/**
 * Archive Routes
 * 
 * API endpoints for History Engine (Archives)
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import * as archiveController from '../controllers/archive.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/v1/archives - Get all archives with filters
router.get('/', archiveController.getArchives);

// GET /api/v1/archives/counts - Get archive counts by source
router.get('/counts', archiveController.getArchiveCounts);

// GET /api/v1/archives/:id - Get single archive
router.get('/:id', archiveController.getArchiveById);

// POST /api/v1/archives - Manually archive a record
router.post('/', authorize('admin', 'manager'), archiveController.createArchive);

// POST /api/v1/archives/:id/restore - Restore an archived record
router.post('/:id/restore', authorize('admin'), archiveController.restoreArchive);

// DELETE /api/v1/archives/:id - Permanently delete archive (Admin only)
router.delete('/:id', authorize('admin'), archiveController.deleteArchive);

export default router;
