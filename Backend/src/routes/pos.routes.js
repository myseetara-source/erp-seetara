/**
 * POS Routes
 * Point-of-Sale specific endpoints for in-store operations
 * 
 * Features:
 * - Exchange/Refund reconciliation
 * - Order lookup for POS
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import * as posController from '../controllers/pos.controller.js';

const router = Router();

// =============================================================================
// PROTECTED ROUTES (Requires authentication)
// =============================================================================

// All POS routes require authentication
router.use(authenticate);

/**
 * GET /pos/order/:id
 * Get order details for reconciliation modal
 * Required for: Exchange/Refund flow
 */
router.get('/order/:id', posController.getOrderForReconcile);

/**
 * POST /pos/reconcile
 * Process exchange or refund for a Store POS order
 * 
 * Body:
 * {
 *   original_order_id: UUID,
 *   return_items: [{ variant_id, quantity, unit_price }],
 *   new_items: [{ variant_id, quantity, unit_price, product_name?, variant_name?, sku? }]
 * }
 */
router.post('/reconcile', posController.reconcilePOS);

export default router;
