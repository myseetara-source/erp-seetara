/**
 * Order Routes
 */

import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createOrderSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
  orderListQuerySchema,
  orderIdSchema,
  orderNumberSchema,
  bulkStatusUpdateSchema,
  assignRiderSchema,
  handoverCourierSchema,
  markDeliveredSchema,
  markReturnedSchema,
} from '../validations/order.validation.js';
import { paginationSchema } from '../validations/common.validation.js';

const router = Router();

// =============================================================================
// PUBLIC ROUTES (for development/demo - move these behind auth in production)
// =============================================================================

// List orders - PUBLIC for demo purposes
// In production, move this behind authenticate middleware
router.get(
  '/',
  validateQuery(orderListQuerySchema),
  orderController.listOrders
);

// =============================================================================
// PROTECTED ROUTES
// =============================================================================

// All routes below require authentication
router.use(authenticate);

// Get order statistics
router.get(
  '/stats',
  authorize('admin', 'manager'),
  orderController.getOrderStats
);

// Create order
router.post(
  '/',
  validateBody(createOrderSchema),
  orderController.createOrder
);

// Get order by order number
router.get(
  '/number/:orderNumber',
  validateParams(orderNumberSchema),
  orderController.getOrderByNumber
);

// Get order by ID
router.get(
  '/:id',
  validateParams(orderIdSchema),
  orderController.getOrder
);

// Update order details
router.patch(
  '/:id',
  validateParams(orderIdSchema),
  validateBody(updateOrderSchema),
  orderController.updateOrder
);

// Delete order (soft delete, admin only)
router.delete(
  '/:id',
  authorize('admin'),
  validateParams(orderIdSchema),
  orderController.deleteOrder
);

// =============================================================================
// STATUS MANAGEMENT
// =============================================================================

// Update order status
router.patch(
  '/:id/status',
  validateParams(orderIdSchema),
  validateBody(updateOrderStatusSchema),
  orderController.updateOrderStatus
);

// Bulk status update (SECURITY: Admin/Manager only - bulk operations are sensitive)
router.post(
  '/bulk/status',
  authorize('admin', 'manager'),
  validateBody(bulkStatusUpdateSchema),
  orderController.bulkUpdateStatus
);

// =============================================================================
// ORDER LOGS
// =============================================================================

// Get order logs
router.get(
  '/:id/logs',
  validateParams(orderIdSchema),
  validateQuery(paginationSchema),
  orderController.getOrderLogs
);

// =============================================================================
// NEPAL LOGISTICS - INSIDE VALLEY (Our Riders)
// =============================================================================

// Get available riders for assignment
router.get(
  '/riders/available',
  authorize('admin', 'manager', 'operator'),
  orderController.getAvailableRiders
);

// Assign rider to order
router.post(
  '/:id/assign-rider',
  validateParams(orderIdSchema),
  validateBody(assignRiderSchema),
  orderController.assignRider
);

// Mark order as out for delivery
router.post(
  '/:id/out-for-delivery',
  validateParams(orderIdSchema),
  orderController.markOutForDelivery
);

// =============================================================================
// NEPAL LOGISTICS - OUTSIDE VALLEY (3rd Party Couriers)
// =============================================================================

// Get courier partners list
router.get(
  '/couriers',
  orderController.getCourierPartners
);

// Handover order to courier
router.post(
  '/:id/handover-courier',
  validateParams(orderIdSchema),
  validateBody(handoverCourierSchema),
  orderController.handoverToCourier
);

// =============================================================================
// DELIVERY ENDPOINTS (Common for all fulfillment types)
// =============================================================================

// Mark order as delivered
router.post(
  '/:id/deliver',
  validateParams(orderIdSchema),
  validateBody(markDeliveredSchema),
  orderController.markDelivered
);

// Mark order as returned
router.post(
  '/:id/return',
  validateParams(orderIdSchema),
  validateBody(markReturnedSchema),
  orderController.markReturned
);

export default router;
