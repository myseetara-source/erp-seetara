/**
 * Logistics Routes
 * 
 * Routes for rider management and inside valley delivery operations
 */

import { Router } from 'express';
import * as logisticsController from '../controllers/logistics.controller.js';
import * as followupController from '../controllers/followup.controller.js';
import * as dispatchController from '../controllers/dispatch.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { uuidSchema, paginationSchema } from '../validations/common.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const bulkAssignSchema = z.object({
  rider_id: uuidSchema,
  order_ids: z.array(uuidSchema).min(1, 'At least one order is required'),
});

const updateDeliveryStatusSchema = z.object({
  order_id: uuidSchema,
  status: z.enum(['picked', 'in_transit', 'delivered', 'failed']),
  notes: z.string().optional(),
  failure_reason: z.string().optional(),
  proof_image_url: z.string().url().optional(),
  recipient_name: z.string().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
});

const followUpSchema = z.object({
  reason: z.string().min(3, 'Reason is required'),
  next_date: z.string().datetime('Valid datetime is required'),
});

const bulkFollowUpSchema = z.object({
  order_ids: z.array(uuidSchema).min(1),
  new_date: z.string().datetime('Valid datetime is required'),
});

// =============================================================================
// FOLLOW-UP ROUTES
// =============================================================================

/**
 * Get pending follow-ups
 * GET /logistics/follow-ups
 */
router.get(
  '/follow-ups',
  authorize(['admin', 'manager', 'operator']),
  validateQuery(paginationSchema.extend({
    date: z.string().optional(),
    overdue: z.enum(['true', 'false']).optional(),
  })),
  followupController.getPendingFollowups
);

/**
 * Schedule follow-up for an order
 * POST /logistics/orders/:id/follow-up
 */
router.post(
  '/orders/:id/follow-up',
  authorize(['admin', 'manager', 'operator']),
  validateParams(z.object({ id: uuidSchema })),
  validateBody(followUpSchema),
  followupController.createFollowup
);

/**
 * Update a follow-up
 * PATCH /logistics/orders/:id/follow-up
 */
router.patch(
  '/orders/:id/follow-up',
  authorize(['admin', 'manager', 'operator']),
  validateParams(z.object({ id: uuidSchema })),
  followupController.updateFollowup
);

// =============================================================================
// RIDER ROUTES (Inside Valley)
// =============================================================================

/**
 * Get available riders
 * GET /logistics/riders
 */
router.get(
  '/riders',
  authorize(['admin', 'manager', 'operator']),
  validateQuery(z.object({
    zone: z.string().optional(),
    available_only: z.enum(['true', 'false']).optional(),
  })),
  logisticsController.getAvailableRiders
);

/**
 * Bulk assign orders to rider
 * POST /logistics/riders/assign
 */
router.post(
  '/riders/assign',
  authorize(['admin', 'manager', 'operator']),
  validateBody(bulkAssignSchema),
  logisticsController.bulkAssignToRider
);

/**
 * Update delivery status (for rider app)
 * POST /logistics/riders/update-status
 */
router.post(
  '/riders/update-status',
  authorize(['admin', 'manager', 'operator', 'rider']),
  validateBody(updateDeliveryStatusSchema),
  logisticsController.updateDeliveryStatus
);

/**
 * Get rider assignments
 * GET /logistics/riders/:id/assignments
 */
router.get(
  '/riders/:id/assignments',
  authorize(['admin', 'manager', 'rider']),
  validateParams(z.object({ id: uuidSchema })),
  validateQuery(z.object({
    status: z.string().optional(),
    date: z.string().optional(),
  })),
  logisticsController.getRiderAssignments
);

/**
 * Get today's inside valley summary
 * GET /logistics/summary
 */
router.get(
  '/summary',
  authorize(['admin', 'manager']),
  logisticsController.getTodaysSummary
);

// =============================================================================
// COURIER ROUTES (Outside Valley)
// =============================================================================

/**
 * Get courier partners
 * GET /logistics/courier/partners
 */
router.get(
  '/courier/partners',
  authorize(['admin', 'manager', 'operator']),
  dispatchController.getCourierPartners
);

/**
 * Handover single order to courier
 * POST /logistics/courier/handover
 */
router.post(
  '/courier/handover',
  authorize(['admin', 'manager', 'operator']),
  validateBody(z.object({
    order_id: uuidSchema,
    courier_partner: z.string().min(1),
    tracking_id: z.string().min(1),
    awb_number: z.string().optional(),
    courier_charge: z.number().optional(),
  })),
  dispatchController.handoverToCourier
);

/**
 * Bulk handover to courier (create manifest)
 * POST /logistics/courier/bulk-handover
 */
router.post(
  '/courier/bulk-handover',
  authorize(['admin', 'manager', 'operator']),
  validateBody(z.object({
    order_ids: z.array(uuidSchema).min(1),
    courier_partner: z.string().min(1),
    tracking_codes: z.array(z.string()).optional(),
    pickup_expected_at: z.string().datetime().optional(),
  })),
  dispatchController.bulkHandoverToCourier
);

/**
 * List manifests
 * GET /logistics/courier/manifests
 */
router.get(
  '/courier/manifests',
  authorize(['admin', 'manager', 'operator']),
  validateQuery(paginationSchema.extend({
    status: z.enum(['draft', 'dispatched', 'in_transit', 'delivered', 'partial']).optional(),
    courier: z.string().optional(),
    date: z.string().optional(),
  })),
  dispatchController.listManifests
);

/**
 * Get manifest details
 * GET /logistics/courier/manifests/:id
 */
router.get(
  '/courier/manifests/:id',
  authorize(['admin', 'manager', 'operator']),
  validateParams(z.object({ id: uuidSchema })),
  dispatchController.getManifest
);

/**
 * Dispatch manifest (mark as picked up)
 * POST /logistics/courier/manifests/:id/dispatch
 */
router.post(
  '/courier/manifests/:id/dispatch',
  authorize(['admin', 'manager', 'operator']),
  validateParams(z.object({ id: uuidSchema })),
  validateBody(z.object({
    tracking_codes: z.array(z.string()).optional(),
  })),
  dispatchController.dispatchManifest
);

/**
 * Get today's courier dispatch summary
 * GET /logistics/courier/summary
 */
router.get(
  '/courier/summary',
  authorize(['admin', 'manager']),
  dispatchController.getTodaysSummary
);

export default router;
