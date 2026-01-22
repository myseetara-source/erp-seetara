/**
 * Order Follow-up Routes
 * 
 * CRM call tracking and follow-up management
 */

import { Router } from 'express';
import * as followupController from '../controllers/followup.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * Create a new follow-up (Log a call)
 * POST /followups
 */
router.post('/', followupController.createFollowup);

/**
 * Get pending follow-ups (Dashboard widget)
 * GET /followups/pending
 */
router.get('/pending', followupController.getPendingFollowups);

/**
 * Get staff performance (Admin only)
 * GET /followups/performance
 */
router.get('/performance', authorize('admin'), followupController.getStaffPerformance);

/**
 * Get follow-ups for a specific order
 * GET /followups/order/:orderId
 */
router.get('/order/:orderId', followupController.getOrderFollowups);

/**
 * Update a follow-up
 * PATCH /followups/:id
 */
router.patch('/:id', followupController.updateFollowup);

export default router;
