/**
 * Inventory Routes
 * 
 * SECURITY: Implements strict "Operational vs. Financial" separation.
 * 
 * Access Rules:
 * - POST /inventory/adjustments  : Staff + Admin (operational)
 * - POST /inventory/damages      : Staff + Admin (operational)
 * - GET  /inventory/movements    : All authenticated (masked)
 * - GET  /inventory/valuation    : Admin ONLY (financial)
 * - GET  /inventory/low-stock    : All authenticated (operational)
 * 
 * Key Security:
 * - Staff reporting damages sees: "Stock Adjusted"
 * - Admin reporting damages sees: "Loss of Rs. X recorded"
 */

import { Router } from 'express';
import {
  createAdjustment,
  reportDamage,
  listAdjustments,
  listDamages,
  getMovementHistory,
  getInventoryValuation,
  getLowStockAlerts,
} from '../controllers/inventory.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { uuidSchema, paginationSchema } from '../validations/common.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createAdjustmentSchema = z.object({
  variant_id: uuidSchema,
  movement_type: z.enum(['adjustment', 'inward', 'outward', 'return', 'correction']),
  quantity: z.number().int().refine(val => val !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(3, 'Reason is required').max(500),
});

const reportDamageSchema = z.object({
  variant_id: uuidSchema,
  quantity: z.number().int().positive('Quantity must be positive'),
  reason: z.string().min(3, 'Damage description is required').max(500),
  damage_type: z.enum(['in_transit', 'warehouse', 'customer_return', 'expired', 'manufacturing']).optional(),
});

const movementQuerySchema = paginationSchema.extend({
  variant_id: uuidSchema.optional(),
  movement_type: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

// =============================================================================
// OPERATIONAL ROUTES - Staff + Admin
// =============================================================================

/**
 * Create stock adjustment
 * POST /inventory/adjustments
 * 
 * SECURITY: Staff CAN create adjustments
 * Response hides financial impact for non-admins
 */
router.post(
  '/adjustments',
  validateBody(createAdjustmentSchema),
  createAdjustment
);

/**
 * List stock adjustments
 * GET /inventory/adjustments
 * 
 * SECURITY: All authenticated, financial data masked
 */
router.get(
  '/adjustments',
  validateQuery(movementQuerySchema),
  listAdjustments
);

/**
 * Report damage
 * POST /inventory/damages
 * 
 * SECURITY: Staff CAN report damages
 * Response: "Stock Adjusted" (NO financial loss shown)
 */
router.post(
  '/damages',
  validateBody(reportDamageSchema),
  reportDamage
);

/**
 * List damages
 * GET /inventory/damages
 * 
 * SECURITY: All authenticated, loss amounts masked for non-admins
 */
router.get(
  '/damages',
  validateQuery(paginationSchema.extend({
    from_date: z.string().optional(),
    to_date: z.string().optional(),
  })),
  listDamages
);

/**
 * Get stock movement history
 * GET /inventory/movements
 * 
 * SECURITY: All authenticated, cost data masked for non-admins
 */
router.get(
  '/movements',
  validateQuery(paginationSchema.extend({
    variant_id: uuidSchema,
  })),
  getMovementHistory
);

/**
 * Get low stock alerts
 * GET /inventory/low-stock
 * 
 * SECURITY: All authenticated (this is operational data)
 */
router.get(
  '/low-stock',
  validateQuery(z.object({
    threshold: z.coerce.number().int().positive().optional(),
  })),
  getLowStockAlerts
);

// =============================================================================
// ADMIN ONLY ROUTES - Financial Data
// =============================================================================

/**
 * Get inventory valuation
 * GET /inventory/valuation
 * 
 * SECURITY: Admin ONLY - This is pure financial data
 * Shows cost values, profit margins, etc.
 */
router.get(
  '/valuation',
  authorize('admin'),
  getInventoryValuation
);

export default router;
