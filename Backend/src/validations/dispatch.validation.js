/**
 * Dispatch Validation Schemas
 * 
 * P0 SECURITY FIX: These validations were missing from dispatch routes
 * All dispatch endpoints now require proper input validation
 * 
 * @author Security Team
 * @priority P0 - Critical Security
 */

import { z } from 'zod';
import { uuidSchema, paginationSchema } from './common.validation.js';

// =============================================================================
// BASE SCHEMAS
// =============================================================================

const uuidArraySchema = z.array(uuidSchema).min(1, 'At least one ID is required');

const manifestStatusSchema = z.enum([
  'open', 'out_for_delivery', 'partially_settled', 'settled', 'cancelled'
]);

const deliveryOutcomeSchema = z.enum([
  'pending', 'delivered', 'partial_delivery', 'customer_refused',
  'customer_unavailable', 'wrong_address', 'rescheduled', 'returned', 
  'damaged', 'lost'
]);

// =============================================================================
// MANIFEST SCHEMAS
// =============================================================================

/**
 * Create Dispatch Manifest
 */
export const createManifestSchema = z.object({
  rider_id: uuidSchema,
  order_ids: uuidArraySchema,
  run_date: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * Update Manifest Status
 */
export const updateManifestStatusSchema = z.object({
  status: manifestStatusSchema,
  notes: z.string().max(1000).optional(),
});

/**
 * Add Orders to Manifest
 */
export const addOrdersToManifestSchema = z.object({
  order_ids: uuidArraySchema,
});

/**
 * Remove Order from Manifest
 */
export const removeOrderFromManifestSchema = z.object({
  order_id: uuidSchema,
  reason: z.string().max(500).optional(),
});

// =============================================================================
// DELIVERY SCHEMAS
// =============================================================================

/**
 * Record Delivery Attempt
 */
export const recordDeliveryAttemptSchema = z.object({
  order_id: uuidSchema,
  outcome: deliveryOutcomeSchema,
  notes: z.string().max(1000).optional(),
  collected_amount: z.number().min(0).optional(),
  reschedule_date: z.string().datetime().optional(),
  photo_urls: z.array(z.string().url()).max(5).optional(),
  signature_url: z.string().url().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/**
 * Bulk Update Delivery Status
 */
export const bulkDeliveryUpdateSchema = z.object({
  updates: z.array(z.object({
    order_id: uuidSchema,
    outcome: deliveryOutcomeSchema,
    collected_amount: z.number().min(0).optional(),
    notes: z.string().max(500).optional(),
  })).min(1).max(50),
});

/**
 * Mark Manifest as Dispatched (Start Delivery Run)
 */
export const startDeliveryRunSchema = z.object({
  manifest_id: uuidSchema,
  start_time: z.string().datetime().optional(),
  vehicle_number: z.string().max(20).optional(),
});

/**
 * Settle Manifest (End of Day)
 */
export const settleManifestSchema = z.object({
  manifest_id: uuidSchema,
  total_collected: z.number().min(0),
  cash_submitted: z.number().min(0),
  discrepancy_reason: z.string().max(500).optional(),
  settlement_notes: z.string().max(1000).optional(),
});

// =============================================================================
// RIDER ASSIGNMENT SCHEMAS
// =============================================================================

/**
 * Assign Rider to Order
 */
export const assignRiderSchema = z.object({
  order_id: uuidSchema,
  rider_id: uuidSchema,
  priority: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Bulk Assign Orders to Rider
 */
export const bulkAssignRiderSchema = z.object({
  rider_id: uuidSchema,
  order_ids: uuidArraySchema,
});

/**
 * Reassign Order to Different Rider
 */
export const reassignOrderSchema = z.object({
  order_id: uuidSchema,
  new_rider_id: uuidSchema,
  reason: z.string().max(500).optional(),
});

// =============================================================================
// COURIER HANDOVER SCHEMAS
// =============================================================================

/**
 * Create Courier Handover
 */
export const createCourierHandoverSchema = z.object({
  courier_partner_id: uuidSchema.optional(),
  courier_partner: z.string().max(100).optional(),
  order_ids: uuidArraySchema,
  branch_code: z.string().max(50).optional(),
  handover_date: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
}).refine(
  data => data.courier_partner_id || data.courier_partner,
  { message: 'Either courier_partner_id or courier_partner name is required' }
);

/**
 * Add AWB Numbers
 */
export const addAwbNumbersSchema = z.object({
  awb_entries: z.array(z.object({
    order_id: uuidSchema,
    awb_number: z.string().min(5).max(50),
    tracking_url: z.string().url().optional(),
  })).min(1).max(100),
});

/**
 * Mark Courier Handover Complete
 */
export const completeCourierHandoverSchema = z.object({
  handover_id: uuidSchema,
  receipt_number: z.string().max(50).optional(),
  receipt_photo_url: z.string().url().optional(),
});

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

/**
 * List Manifests Query
 */
export const listManifestsQuerySchema = paginationSchema.extend({
  rider_id: uuidSchema.optional(),
  status: manifestStatusSchema.optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

/**
 * List Orders for Dispatch Query
 */
export const dispatchableOrdersQuerySchema = paginationSchema.extend({
  fulfillment_type: z.enum(['inside_valley', 'outside_valley', 'store']).optional(),
  zone_code: z.string().max(20).optional(),
  status: z.string().optional(),
});

/**
 * Rider Performance Query
 */
export const riderPerformanceQuerySchema = z.object({
  rider_id: uuidSchema,
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

// =============================================================================
// ID PARAMETER SCHEMAS
// =============================================================================

export const manifestIdSchema = z.object({
  id: uuidSchema,
});

export const manifestIdParamSchema = z.object({
  manifestId: uuidSchema,
});

export const orderIdParamSchema = z.object({
  orderId: uuidSchema,
});

export const riderIdParamSchema = z.object({
  riderId: uuidSchema,
});

// =============================================================================
// EXPORT ALL
// =============================================================================

export default {
  createManifestSchema,
  updateManifestStatusSchema,
  addOrdersToManifestSchema,
  removeOrderFromManifestSchema,
  recordDeliveryAttemptSchema,
  bulkDeliveryUpdateSchema,
  startDeliveryRunSchema,
  settleManifestSchema,
  assignRiderSchema,
  bulkAssignRiderSchema,
  reassignOrderSchema,
  createCourierHandoverSchema,
  addAwbNumbersSchema,
  completeCourierHandoverSchema,
  listManifestsQuerySchema,
  dispatchableOrdersQuerySchema,
  riderPerformanceQuerySchema,
  manifestIdSchema,
  manifestIdParamSchema,
  orderIdParamSchema,
  riderIdParamSchema,
};
