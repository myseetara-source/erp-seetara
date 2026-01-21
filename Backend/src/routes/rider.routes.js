/**
 * Rider Routes
 * 
 * API endpoints for rider management and delivery operations.
 * 
 * Route Groups:
 * - /dispatch/* : Admin/Staff endpoints for managing riders
 * - /rider/*   : Rider app endpoints (requires role: 'rider')
 * 
 * @module routes/rider.routes
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import {
  listRiders,
  getRider,
  assignOrdersToRider,
  updateRiderStatus,
  verifySettlement,
  getMyProfile,
  getRiderTasks,
  reorderTasks,
  updateDeliveryStatus,
  updateLocation,
  startRun,
  endRun,
  getCashSummary,
  submitSettlement,
} from '../controllers/rider.controller.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const assignOrdersSchema = z.object({
  rider_id: z.string().uuid('Invalid rider ID'),
  order_ids: z.array(z.string().uuid()).min(1, 'At least one order required'),
});

const updateStatusSchema = z.object({
  status: z.enum(['available', 'on_delivery', 'on_break', 'off_duty', 'suspended']),
});

const reorderTasksSchema = z.object({
  orders: z.array(z.object({
    order_id: z.string().uuid(),
    sequence: z.number().int().min(1),
  })).min(1),
});

const deliveryStatusSchema = z.object({
  order_id: z.string().uuid('Invalid order ID'),
  status: z.enum(['delivered', 'rejected', 'not_home', 'wrong_address', 'rescheduled', 'returned']),
  reason: z.string().optional(),
  collected_cash: z.number().min(0).optional(),
  proof_photo_url: z.string().url().optional(),
  notes: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const settlementSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  method: z.enum(['cash', 'bank_transfer']).optional(),
});

const verifySettlementSchema = z.object({
  actual_amount: z.number().min(0),
  notes: z.string().optional(),
});

// =============================================================================
// DISPATCH ROUTES (Admin/Staff)
// =============================================================================

const dispatchRouter = Router();

// Require authentication for all dispatch routes
dispatchRouter.use(authenticate);
dispatchRouter.use(authorize('admin', 'staff', 'operator'));

// List all riders
dispatchRouter.get('/riders', listRiders);

// Get single rider
dispatchRouter.get('/riders/:id', getRider);

// Assign orders to rider
dispatchRouter.post('/assign', validate(assignOrdersSchema), assignOrdersToRider);

// Update rider status
dispatchRouter.patch('/riders/:id/status', validate(updateStatusSchema), updateRiderStatus);

// Verify settlement (Admin only)
dispatchRouter.post('/settlements/:id/verify', 
  authorize('admin'),
  validate(verifySettlementSchema),
  verifySettlement
);

// =============================================================================
// RIDER APP ROUTES (Rider role only)
// =============================================================================

const riderRouter = Router();

// Require authentication for all rider routes
riderRouter.use(authenticate);

// Middleware to verify rider role
const requireRider = (req, res, next) => {
  if (req.user.role !== 'rider') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Rider role required.',
    });
  }
  next();
};

riderRouter.use(requireRider);

// Profile
riderRouter.get('/me', getMyProfile);

// Tasks
riderRouter.get('/tasks', getRiderTasks);
riderRouter.patch('/tasks/reorder', validate(reorderTasksSchema), reorderTasks);

// Delivery status update
riderRouter.post('/update-status', validate(deliveryStatusSchema), updateDeliveryStatus);

// Location
riderRouter.post('/location', validate(locationSchema), updateLocation);

// Run management
riderRouter.post('/start-run', startRun);
riderRouter.post('/end-run', endRun);

// Cash & Settlement
riderRouter.get('/cash', getCashSummary);
riderRouter.post('/settle', validate(settlementSchema), submitSettlement);

// =============================================================================
// MOUNT ROUTERS
// =============================================================================

router.use('/dispatch', dispatchRouter);
router.use('/rider', riderRouter);

export default router;
