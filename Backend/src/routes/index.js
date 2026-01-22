/**
 * Routes Index
 * 
 * Central router configuration - Clean Table of Contents
 * 
 * DESIGN PRINCIPLE: This file should ONLY mount sub-routers.
 * No inline handlers, no business logic, no database queries.
 * 
 * All logic must live in Controllers.
 */

import { Router } from 'express';

// =============================================================================
// ROUTE IMPORTS (Alphabetically ordered)
// =============================================================================

import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import customerRoutes from './customer.routes.js';
import externalRoutes from './external.routes.js';
import followupRoutes from './followup.routes.js';
import inventoryRoutes from './inventory.routes.js';
import logisticsRoutes from './logistics.routes.js';
import orderRoutes from './order.routes.js';
import productRoutes from './product.routes.js';
import purchaseRoutes from './purchase.routes.js';
import riderRoutes from './rider.routes.js';
import smsRoutes from './sms.routes.js';
import staticRoutes from './static.routes.js';
import stockRoutes from './stock.routes.js';
import ticketRoutes from './ticket.routes.js';
import uploadRoutes from './upload.routes.js';
import userRoutes from './user.routes.js';
import variantRoutes from './variant.routes.js';
import vendorRoutes from './vendor.routes.js';
import vendorPortalRoutes from './vendor-portal.routes.js';
import webhookRoutes from './webhook.routes.js';

// Controllers for backward-compatible routes
import * as staticController from '../controllers/static.controller.js';

const router = Router();

// =============================================================================
// HEALTH CHECK (Delegates to controller - no inline logic)
// =============================================================================

router.get('/health', staticController.getHealthStatus);

// =============================================================================
// API ROUTES (Alphabetically ordered)
// =============================================================================

router.use('/admin', adminRoutes);
router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/external', externalRoutes);
router.use('/followups', followupRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/logistics', logisticsRoutes);
router.use('/orders', orderRoutes);
router.use('/products', productRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/sms', smsRoutes);
router.use('/static', staticRoutes);
router.use('/stock', stockRoutes);
router.use('/tickets', ticketRoutes);
router.use('/upload', uploadRoutes);
router.use('/users', userRoutes);
router.use('/variants', variantRoutes);
router.use('/vendors', vendorRoutes);
router.use('/vendor-portal', vendorPortalRoutes);
router.use('/webhooks', webhookRoutes);

// Rider routes mount at root level (includes /dispatch/* and /rider/*)
router.use('/', riderRoutes);

// =============================================================================
// BACKWARD COMPATIBILITY ROUTES
// =============================================================================
// Some older frontend code calls /categories and /brands directly
// instead of /static/categories and /static/brands.
// These routes delegate to the static controller.

router.get('/categories', staticController.getCategories);
router.post('/categories', staticController.createCategory);
router.get('/brands', staticController.getBrands);
router.post('/brands', staticController.createBrand);

// =============================================================================
// EXPORT
// =============================================================================

export default router;
