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
import followupRoutes from './followup.routes.js'; // ORDER 360: CRM call tracking

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
router.use('/followups', followupRoutes); // ORDER 360: CRM call tracking

// =============================================================================
// BACKWARD COMPATIBILITY ROUTES
// Some frontend components call /categories directly instead of /static/categories
// =============================================================================
import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';

// GET /categories - Backward compatible route
router.get('/categories', asyncHandler(async (req, res) => {
  const { search, limit = 50 } = req.query;
  
  let query = supabaseAdmin
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(Number(limit));
  
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.warn('[Routes] Categories fallback error:', error);
    // Fallback to extracting from products
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('category')
      .eq('is_active', true)
      .not('category', 'is', null);
    
    const categories = [...new Set((products || []).map(p => p.category).filter(Boolean))];
    return res.json({ success: true, data: categories.sort() });
  }
  
  res.json({ success: true, data: (data || []).map(c => c.name) });
}));

// POST /categories - Create new category
router.post('/categories', asyncHandler(async (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ success: false, error: 'Category name is required' });
  }
  
  const { data, error } = await supabaseAdmin
    .from('categories')
    .upsert({ name: name.trim() }, { onConflict: 'name' })
    .select()
    .single();
  
  if (error) {
    console.error('[Routes] Create category error:', error);
    return res.status(500).json({ success: false, error: 'Failed to create category' });
  }
  
  res.json({ success: true, data });
}));

// GET /brands - Backward compatible route
router.get('/brands', asyncHandler(async (req, res) => {
  const { search, limit = 50 } = req.query;
  
  let query = supabaseAdmin
    .from('brands')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(Number(limit));
  
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.warn('[Routes] Brands fallback error:', error);
    // Fallback to extracting from products
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('brand')
      .eq('is_active', true)
      .not('brand', 'is', null);
    
    const brands = [...new Set((products || []).map(p => p.brand).filter(Boolean))];
    return res.json({ success: true, data: brands.sort() });
  }
  
  res.json({ success: true, data: (data || []).map(b => b.name) });
}));

export default router;
