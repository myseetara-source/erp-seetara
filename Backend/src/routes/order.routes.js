/**
 * Order Routes
 */

import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import * as orderPaymentController from '../controllers/orderPayment.controller.js';
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
// PROTECTED ROUTES - All order routes require authentication
// =============================================================================

// List orders - PROTECTED (Audit Fix CRIT-001)
router.get(
  '/',
  authenticate,
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

// Refresh orders cache (materialized view) - Admin only
router.post(
  '/refresh-cache',
  authorize('admin'),
  orderController.refreshOrdersCache
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
// ORDER ITEMS MANAGEMENT (Add/Remove/Update items)
// =============================================================================

// Add item to order
router.post(
  '/:id/items',
  validateParams(orderIdSchema),
  orderController.addOrderItem
);

// Update order item (quantity/price)
router.patch(
  '/:id/items/:itemId',
  orderController.updateOrderItem
);

// Remove item from order
router.delete(
  '/:id/items/:itemId',
  orderController.removeOrderItem
);

// =============================================================================
// REMARKS (Sticky Notes)
// =============================================================================

// Update order remarks (allowed for any status)
router.patch(
  '/:id/remarks',
  validateParams(orderIdSchema),
  orderController.updateOrderRemarks
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

// Get order logs (legacy)
router.get(
  '/:id/logs',
  validateParams(orderIdSchema),
  validateQuery(paginationSchema),
  orderController.getOrderLogs
);

// =============================================================================
// ORDER ACTIVITIES (Timeline Feature)
// =============================================================================

// Get order activities timeline
router.get(
  '/:id/activities',
  validateParams(orderIdSchema),
  orderController.getOrderActivitiesHandler
);

// Add activity (comment) to order
router.post(
  '/:id/activities',
  validateParams(orderIdSchema),
  orderController.addOrderActivity
);

// Get related orders (parent/child for exchanges)
router.get(
  '/:id/related',
  validateParams(orderIdSchema),
  orderController.getRelatedOrdersHandler
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

// =============================================================================
// WORKFLOW INFO ENDPOINTS (For Smart UI)
// =============================================================================

// Get workflow info for an order (allowed transitions, locks, requirements)
router.get(
  '/:id/workflow',
  validateParams(orderIdSchema),
  orderController.getOrderWorkflow
);

// Get dispatch requirements for a status
router.get(
  '/dispatch-requirements/:status',
  orderController.getDispatchRequirements
);

// =============================================================================
// CUSTOMER ADVANCE PAYMENTS
// =============================================================================

// Get presigned URL for receipt upload (before creating payment)
router.post(
  '/payments/presign',
  orderPaymentController.getReceiptPresignedUrl
);

// Get payment summary for an order
router.get(
  '/:id/payment-summary',
  validateParams(orderIdSchema),
  orderPaymentController.getOrderPaymentSummary
);

// Get all payments for an order
router.get(
  '/:id/payments',
  validateParams(orderIdSchema),
  orderPaymentController.getOrderPayments
);

// Record a new payment for an order
router.post(
  '/:id/payments',
  validateParams(orderIdSchema),
  orderPaymentController.createOrderPayment
);

// Delete a payment (soft delete, admin only)
router.delete(
  '/:id/payments/:paymentId',
  authorize('admin'),
  orderPaymentController.deleteOrderPayment
);

export default router;
