/**
 * Static Data Controller
 * 
 * Handles cacheable endpoints for rarely-changing data:
 * - Categories
 * - Brands  
 * - Delivery Zones
 * - Order Statuses
 * - Payment Methods
 * - App Config
 * 
 * DESIGN: These are "reference data" endpoints that rarely change.
 * Frontend should cache these aggressively.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { catchAsync } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
import config from '../config/index.js';
import { CACHE_DURATION } from '../middleware/cache.middleware.js';
import { sanitizeSearchInput } from '../utils/helpers.js';

/**
 * Generate a URL-safe slug from a string
 * @param {string} text - The text to convert to a slug
 * @returns {string} - URL-safe slug
 */
const generateSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

const logger = createLogger('StaticController');

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * Get all product categories
 * GET /categories or /static/categories
 */
export const getCategories = catchAsync(async (req, res) => {
  const { search, limit = 100 } = req.query;

  // Try to get from dedicated categories table first
  let query = supabaseAdmin
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(Number(limit));

  if (search) {
    // SECURITY: Sanitize search to prevent SQL injection
    const sanitizedSearch = sanitizeSearchInput(search);
    if (sanitizedSearch) {
      query = query.ilike('name', `%${sanitizedSearch}%`);
    }
  }

  const { data, error } = await query;

  if (!error && data && data.length > 0) {
    return res.json({
      success: true,
      data: data.map(c => c.name),
      meta: { count: data.length, source: 'categories_table', cache_ttl: CACHE_DURATION?.LONG || 3600 },
    });
  }

  // Fallback: Extract unique categories from products
  logger.debug('Categories table not available, falling back to products');
  
  const { data: products, error: productsError } = await supabaseAdmin
    .from('products')
    .select('category')
    .eq('is_active', true)
    .not('category', 'is', null);

  if (productsError) {
    logger.error('Failed to fetch categories', { error: productsError });
    return res.json({ success: true, data: [] });
  }

  const categories = [...new Set((products || []).map(p => p.category).filter(Boolean))].sort();

  res.json({
    success: true,
    data: categories,
    meta: { count: categories.length, source: 'products_table', cache_ttl: CACHE_DURATION?.LONG || 3600 },
  });
});

/**
 * Create a new category
 * POST /categories
 */
export const createCategory = catchAsync(async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Category name is required (minimum 2 characters)',
    });
  }

  const trimmedName = name.trim();
  const slug = generateSlug(trimmedName);

  const { data, error } = await supabaseAdmin
    .from('categories')
    .upsert({ name: trimmedName, slug, is_active: true }, { onConflict: 'name' })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create category', { error, name });
    return res.status(500).json({
      success: false,
      error: 'Failed to create category',
    });
  }

  res.status(201).json({
    success: true,
    data,
    message: 'Category created successfully',
  });
});

// =============================================================================
// BRANDS
// =============================================================================

/**
 * Get all product brands
 * GET /brands or /static/brands
 */
export const getBrands = catchAsync(async (req, res) => {
  const { search, limit = 100 } = req.query;

  // Try to get from dedicated brands table first
  let query = supabaseAdmin
    .from('brands')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(Number(limit));

  if (search) {
    // SECURITY: Sanitize search to prevent SQL injection
    const sanitizedSearch = sanitizeSearchInput(search);
    if (sanitizedSearch) {
      query = query.ilike('name', `%${sanitizedSearch}%`);
    }
  }

  const { data, error } = await query;

  if (!error && data && data.length > 0) {
    return res.json({
      success: true,
      data: data.map(b => b.name),
      meta: { count: data.length, source: 'brands_table', cache_ttl: CACHE_DURATION?.LONG || 3600 },
    });
  }

  // Fallback: Extract unique brands from products
  logger.debug('Brands table not available, falling back to products');

  const { data: products, error: productsError } = await supabaseAdmin
    .from('products')
    .select('brand')
    .eq('is_active', true)
    .not('brand', 'is', null);

  if (productsError) {
    logger.error('Failed to fetch brands', { error: productsError });
    return res.json({ success: true, data: [] });
  }

  const brands = [...new Set((products || []).map(p => p.brand).filter(Boolean))].sort();

  res.json({
    success: true,
    data: brands,
    meta: { count: brands.length, source: 'products_table', cache_ttl: CACHE_DURATION?.LONG || 3600 },
  });
});

/**
 * Create a new brand
 * POST /brands
 */
export const createBrand = catchAsync(async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Brand name is required (minimum 2 characters)',
    });
  }

  const trimmedName = name.trim();
  const slug = generateSlug(trimmedName);

  const { data, error } = await supabaseAdmin
    .from('brands')
    .upsert({ name: trimmedName, slug, is_active: true }, { onConflict: 'name' })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create brand', { error, name });
    return res.status(500).json({
      success: false,
      error: 'Failed to create brand',
    });
  }

  res.status(201).json({
    success: true,
    data,
    message: 'Brand created successfully',
  });
});

// =============================================================================
// DELIVERY ZONES
// =============================================================================

/**
 * Get all delivery zones
 * GET /static/delivery-zones
 */
export const getDeliveryZones = catchAsync(async (req, res) => {
  const { data: zones, error } = await supabaseAdmin
    .from('delivery_zones')
    .select('id, name, type, base_charge, per_kg_charge, is_active')
    .eq('is_active', true)
    .order('name');

  if (error) {
    logger.error('Failed to fetch delivery zones', { error });
    return res.json({ success: true, data: [] });
  }

  res.json({
    success: true,
    data: zones || [],
    meta: { count: zones?.length || 0, cache_ttl: CACHE_DURATION?.LONG || 3600 },
  });
});

// =============================================================================
// STATIC ENUMS (No database needed)
// =============================================================================

/**
 * Get fulfillment type options
 * GET /static/fulfillment-types
 */
export const getFulfillmentTypes = (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'inside_valley', label: 'Inside Valley', description: 'Kathmandu Valley - Same day delivery' },
      { value: 'outside_valley', label: 'Outside Valley', description: 'Outside Kathmandu - 3-7 days' },
      { value: 'store', label: 'Store Pickup', description: 'Customer picks up from store' },
    ],
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get order status configuration
 * GET /static/order-statuses
 */
export const getOrderStatuses = (req, res) => {
  res.json({
    success: true,
    data: config.orderStatuses,
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get order status transitions (State Machine)
 * GET /static/status-transitions
 */
export const getStatusTransitions = (req, res) => {
  res.json({
    success: true,
    data: config.statusTransitions,
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get available payment methods
 * GET /static/payment-methods
 */
export const getPaymentMethods = (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'cod', label: 'Cash on Delivery', icon: 'cash' },
      { value: 'esewa', label: 'eSewa', icon: 'wallet' },
      { value: 'khalti', label: 'Khalti', icon: 'wallet' },
      { value: 'bank_transfer', label: 'Bank Transfer', icon: 'bank' },
      { value: 'cash', label: 'Cash', icon: 'cash' },
    ],
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get order source options
 * GET /static/order-sources
 */
export const getOrderSources = (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'manual', label: 'Manual Entry' },
      { value: 'website', label: 'Website' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'store', label: 'Store Walk-in' },
      { value: 'todaytrend', label: 'Today Trend' },
      { value: 'seetara', label: 'Seetara' },
    ],
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get app configuration
 * GET /static/app-config
 */
export const getAppConfig = (req, res) => {
  res.json({
    success: true,
    data: {
      company: {
        name: 'Seetara / Today Trend',
        currency: 'NPR',
        country: 'Nepal',
      },
      shipping: {
        defaultInsideValley: 100,
        defaultOutsideValley: 150,
        storePickup: 0,
      },
      inventory: {
        lowStockThreshold: 10,
        reorderLevel: 5,
      },
      features: {
        smsEnabled: process.env.SMS_ENABLED === 'true',
        metaCAPIEnabled: !!process.env.FB_PIXEL_ID,
      },
    },
    meta: { cache_ttl: 300 },
  });
};

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * API Health Check
 * GET /health
 */
export const getHealthStatus = (req, res) => {
  res.json({
    success: true,
    message: 'ERP API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
};

// =============================================================================
// P0 FIX: Order ID Trigger Migration
// =============================================================================

const ORDER_ID_MIGRATION_SQL = `
-- =============================================================================
-- P0 FIX: Bulletproof Order Number Generation
-- Fixes "invalid input syntax for type integer: 'IV-001'" error
-- ROOT CAUSE: generate_order_number() parses legacy ORD-IV-001 formats
-- =============================================================================

-- STEP 1: Fix the generate_order_number function (THE ACTUAL BUG!)
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_seq INTEGER := 0;
    v_candidate TEXT;
    rec RECORD;
BEGIN
    -- Skip if order_number is already set
    IF NEW.order_number IS NOT NULL AND LENGTH(TRIM(NEW.order_number)) > 0 THEN
        RETURN NEW;
    END IF;
    
    -- P0 FIX: Process one row at a time to handle legacy formats safely
    BEGIN
        FOR rec IN 
            SELECT order_number FROM orders 
            WHERE order_number IS NOT NULL
              AND order_number LIKE 'ORD-%'
              AND SUBSTRING(order_number FROM 5) ~ '^[0-9]+$'
        LOOP
            BEGIN
                v_candidate := SUBSTRING(rec.order_number FROM 5);
                IF v_candidate ~ '^[0-9]+$' THEN
                    IF v_candidate::INT > v_seq THEN
                        v_seq := v_candidate::INT;
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        v_seq := (EXTRACT(EPOCH FROM NOW())::INT % 900000);
    END;
    
    NEW.order_number := 'ORD-' || LPAD((v_seq + 1)::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 2: Drop problematic readable_id triggers
DROP TRIGGER IF EXISTS trg_generate_readable_id ON orders;
DROP TRIGGER IF EXISTS trg_prevent_readable_id_change ON orders;
DROP TRIGGER IF EXISTS trg_generate_smart_order_id ON orders;
DROP TRIGGER IF EXISTS generate_smart_order_id_trigger ON orders;
DROP FUNCTION IF EXISTS generate_smart_order_id() CASCADE;
DROP FUNCTION IF EXISTS prevent_readable_id_change() CASCADE;

-- STEP 3: Create safe readable_id function
CREATE OR REPLACE FUNCTION generate_order_readable_id_safe()
RETURNS TRIGGER AS $$
DECLARE
    v_date_prefix TEXT;
    v_max_seq INT := 100;
    v_new_seq INT;
    v_candidate TEXT;
    v_extracted INT;
    rec RECORD;
BEGIN
    IF NEW.readable_id IS NOT NULL AND LENGTH(TRIM(NEW.readable_id)) > 0 THEN
        RETURN NEW;
    END IF;
    
    v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
    
    BEGIN
        FOR rec IN 
            SELECT readable_id FROM orders 
            WHERE readable_id IS NOT NULL
              AND readable_id LIKE v_date_prefix || '-%'
              AND array_length(string_to_array(readable_id, '-'), 1) = 4
        LOOP
            BEGIN
                v_candidate := SPLIT_PART(rec.readable_id, '-', 4);
                v_candidate := REGEXP_REPLACE(v_candidate, '[^0-9]', '', 'g');
                IF v_candidate ~ '^[0-9]+$' AND LENGTH(v_candidate) > 0 THEN
                    v_extracted := v_candidate::INT;
                    IF v_extracted > v_max_seq THEN v_max_seq := v_extracted; END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        v_max_seq := 100 + (EXTRACT(EPOCH FROM NOW())::INT % 800);
    END;
    
    v_new_seq := v_max_seq + 1;
    NEW.readable_id := v_date_prefix || '-' || v_new_seq::TEXT;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 4: Create readable_id trigger
DROP TRIGGER IF EXISTS trg_generate_order_readable_id ON orders;
CREATE TRIGGER trg_generate_order_readable_id
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION generate_order_readable_id_safe();
`;

/**
 * Get Order ID Migration SQL
 * GET /health/fix-order-trigger
 * 
 * Returns the SQL that needs to be run in Supabase SQL Editor
 * to fix the IV-001 parsing error that breaks POS Exchange/Refund.
 */
export const getOrderIdMigration = async (req, res) => {
  logger.info('[Migration] Order ID fix migration requested');
  
  res.json({
    success: true,
    message: 'Copy the SQL below and run it in Supabase SQL Editor',
    instructions: [
      '1. Go to: https://supabase.com/dashboard/project/narlifgdtmlockhugfgz/sql/new',
      '2. Paste the SQL below into the editor',
      '3. Click "Run" to execute',
      '4. Refresh the ERP application and try Exchange/Refund again',
    ],
    migration_sql: ORDER_ID_MIGRATION_SQL,
    fix_for: 'POS Exchange/Refund - "invalid input syntax for type integer: IV-001" error',
  });
};

export default {
  getCategories,
  createCategory,
  getBrands,
  createBrand,
  getDeliveryZones,
  getFulfillmentTypes,
  getOrderStatuses,
  getStatusTransitions,
  getPaymentMethods,
  getOrderSources,
  getAppConfig,
  getHealthStatus,
  getOrderIdMigration,
};
