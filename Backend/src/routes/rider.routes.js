/**
 * Rider Portal API Routes
 * 
 * Endpoints for the mobile Rider App:
 * - GET /rider/me - Get current rider's profile (alias for /rider/profile)
 * - GET /rider/tasks - Get assigned orders (pending delivery)
 * - GET /rider/cash - Get cash summary (COD due)
 * - GET /rider/history - Get delivery history
 * - GET /rider/profile - Get rider profile & stats
 * - POST /rider/delivery-outcome - Submit delivery outcome
 * - POST /rider/toggle-duty - Toggle on/off duty
 * - POST /rider/update-location - Update GPS location
 * 
 * @priority P0 - Rider Portal
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import * as riderController from '../controllers/rider.controller.js';

const router = Router();

// =============================================================================
// RIDER APP ROUTES (Require authentication)
// =============================================================================

/**
 * GET /rider/me
 * Get current rider's profile (alias for profile - used by frontend)
 */
router.get('/rider/me', authenticate, riderController.getProfile);

/**
 * GET /rider/tasks
 * Get orders assigned to the current rider (pending delivery)
 */
router.get('/rider/tasks', authenticate, riderController.getTasks);

/**
 * GET /rider/cash
 * Get cash summary (COD collected, due, etc.)
 */
router.get('/rider/cash', authenticate, riderController.getCashSummary);

/**
 * GET /rider/history
 * Get delivery history (last N days)
 */
router.get('/rider/history', authenticate, riderController.getHistory);

/**
 * GET /rider/settlements
 * Get settlement history (last N days)
 */
router.get('/rider/settlements', authenticate, riderController.getSettlements);

/**
 * GET /rider/profile
 * Get rider profile with stats
 */
router.get('/rider/profile', authenticate, riderController.getProfile);

/**
 * POST /rider/toggle-duty
 * Toggle on/off duty status
 */
router.post('/rider/toggle-duty', authenticate, riderController.toggleDuty);

/**
 * POST /rider/update-location
 * Update current GPS location
 */
router.post('/rider/update-location', authenticate, riderController.updateLocation);

/**
 * POST /rider/delivery-outcome
 * Submit delivery outcome (delivered, reschedule, reject)
 */
router.post('/rider/delivery-outcome', authenticate, riderController.submitDeliveryOutcome);

/**
 * POST /rider/update-status
 * Update delivery status (alias for delivery-outcome - used by frontend)
 */
router.post('/rider/update-status', authenticate, riderController.submitDeliveryOutcome);

/**
 * POST /rider/send-sms
 * Send SMS to customer from rider app
 */
router.post('/rider/send-sms', authenticate, riderController.sendCustomerSMS);

// =============================================================================
// LEGACY DISPATCH ENDPOINTS (for backward compatibility)
// =============================================================================

/**
 * GET /dispatch/riders
 * List all riders (for dispatch center)
 */
router.get('/dispatch/riders', authenticate, authorize('admin', 'manager', 'operator'), riderController.listRiders);

/**
 * POST /dispatch/assign
 * Assign orders to a rider
 */
router.post('/dispatch/assign', authenticate, authorize('admin', 'manager', 'operator'), riderController.assignOrdersToRider);

export default router;
