/**
 * Routes Index
 * Central router configuration
 */

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import productRoutes from './product.routes.js';
import variantRoutes from './variant.routes.js';
import stockRoutes from './stock.routes.js';
import orderRoutes from './order.routes.js';
import vendorRoutes from './vendor.routes.js';
import vendorPortalRoutes from './vendor-portal.routes.js';
import webhookRoutes from './webhook.routes.js';
import purchaseRoutes from './purchase.routes.js';
import uploadRoutes from './upload.routes.js';
import inventoryRoutes from './inventory.routes.js';
import customerRoutes from './customer.routes.js';
import logisticsRoutes from './logistics.routes.js';
import ticketRoutes from './ticket.routes.js';
import riderRoutes from './rider.routes.js';
import smsRoutes from './sms.routes.js';
import externalRoutes from './external.routes.js';
import staticRoutes from './static.routes.js'; // PERF-003: Cached static data

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ERP API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API Routes
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/variants', variantRoutes);
router.use('/stock', stockRoutes);
router.use('/orders', orderRoutes);
router.use('/vendors', vendorRoutes);
router.use('/vendor-portal', vendorPortalRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/upload', uploadRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/customers', customerRoutes);
router.use('/logistics', logisticsRoutes);
router.use('/tickets', ticketRoutes);
router.use('/', riderRoutes); // Mounts /dispatch/* and /rider/*
router.use('/sms', smsRoutes);
router.use('/external', externalRoutes); // External website integrations
router.use('/static', staticRoutes); // PERF-003: Cached static data (categories, zones, config)

export default router;
