/**
 * Brand Controller
 * 
 * Full CRUD for product brands.
 * Follows Route -> Controller -> Service pattern.
 * 
 * SECURITY:
 * - GET (list/detail): Authenticated users
 * - POST/PATCH/DELETE: Admin & Manager only
 */

import { supabaseAdmin } from '../config/supabase.js';
import { catchAsync } from '../utils/errors.js';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
import { sanitizeSearchInput } from '../utils/helpers.js';

const logger = createLogger('BrandController');

// =============================================================================
// UTILITY: Slug Generator
// =============================================================================

const generateSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// =============================================================================
// LIST BRANDS
// GET /api/v1/brands
// =============================================================================

export const listBrands = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 50, is_active } = req.query;

  const offset = (page - 1) * limit;

  // Build query
  let query = supabaseAdmin
    .from('brands')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  // Filters
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true');
  }

  if (search) {
    const sanitized = sanitizeSearchInput(search);
    if (sanitized) {
      query = query.ilike('name', `%${sanitized}%`);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('Failed to list brands', { error });
    throw error;
  }

  // Enrich with product counts
  const enriched = await enrichWithProductCounts(data || []);

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  res.json({
    success: true,
    data: enriched,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
});

// =============================================================================
// GET SINGLE BRAND
// GET /api/v1/brands/:id
// =============================================================================

export const getBrand = catchAsync(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('brands')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new NotFoundError('Brand');
  }

  // Get product count
  const { count } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('brand', data.name);

  res.json({
    success: true,
    data: { ...data, product_count: count || 0 },
  });
});

// =============================================================================
// CREATE BRAND
// POST /api/v1/brands
// =============================================================================

export const createBrand = catchAsync(async (req, res) => {
  const { name, logo_url, is_active } = req.body;

  const slug = generateSlug(name);

  // Check for duplicate name
  const { data: existing } = await supabaseAdmin
    .from('brands')
    .select('id')
    .ilike('name', name.trim())
    .single();

  if (existing) {
    throw new ConflictError(`Brand "${name}" already exists`);
  }

  // Check for duplicate slug
  const { data: existingSlug } = await supabaseAdmin
    .from('brands')
    .select('id')
    .eq('slug', slug)
    .single();

  if (existingSlug) {
    throw new ConflictError(`A brand with slug "${slug}" already exists`);
  }

  const { data, error } = await supabaseAdmin
    .from('brands')
    .insert({
      name: name.trim(),
      slug,
      logo_url: logo_url || null,
      is_active: is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create brand', { error, name });
    if (error.code === '23505') {
      throw new ConflictError(`Brand "${name}" already exists`);
    }
    throw error;
  }

  logger.info('Brand created', { id: data.id, name: data.name, by: req.user?.email });

  res.status(201).json({
    success: true,
    data,
    message: 'Brand created successfully',
  });
});

// =============================================================================
// UPDATE BRAND
// PATCH /api/v1/brands/:id
// =============================================================================

export const updateBrand = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Verify brand exists
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('brands')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    throw new NotFoundError('Brand');
  }

  // If name is being changed, regenerate slug and check uniqueness
  if (updates.name && updates.name.trim() !== existing.name) {
    const slug = generateSlug(updates.name);
    updates.slug = slug;

    // Check for duplicate name (exclude current)
    const { data: duplicate } = await supabaseAdmin
      .from('brands')
      .select('id')
      .ilike('name', updates.name.trim())
      .neq('id', id)
      .single();

    if (duplicate) {
      throw new ConflictError(`Brand "${updates.name}" already exists`);
    }
  }

  // Clean up the updates object
  const cleanUpdates = {};
  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.slug !== undefined) cleanUpdates.slug = updates.slug;
  if (updates.logo_url !== undefined) cleanUpdates.logo_url = updates.logo_url;
  if (updates.is_active !== undefined) cleanUpdates.is_active = updates.is_active;

  if (Object.keys(cleanUpdates).length === 0) {
    throw new BadRequestError('No valid fields to update');
  }

  const { data, error } = await supabaseAdmin
    .from('brands')
    .update(cleanUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update brand', { error, id });
    if (error.code === '23505') {
      throw new ConflictError(`Brand name or slug already exists`);
    }
    throw error;
  }

  // If name was changed, update all products referencing the old name
  if (updates.name && updates.name.trim() !== existing.name) {
    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update({ brand: updates.name.trim() })
      .eq('brand', existing.name);

    if (updateError) {
      logger.warn('Failed to update product brand references', { error: updateError });
    } else {
      logger.info('Updated product brand references', {
        oldName: existing.name,
        newName: updates.name.trim(),
      });
    }
  }

  logger.info('Brand updated', { id, changes: Object.keys(cleanUpdates), by: req.user?.email });

  res.json({
    success: true,
    data,
    message: 'Brand updated successfully',
  });
});

// =============================================================================
// DELETE BRAND
// DELETE /api/v1/brands/:id
// =============================================================================

export const deleteBrand = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Verify brand exists
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('brands')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    throw new NotFoundError('Brand');
  }

  // Check if any products use this brand
  const { count: productCount } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('brand', existing.name);

  if (productCount && productCount > 0) {
    throw new ConflictError(
      `Cannot delete brand "${existing.name}". It is used by ${productCount} product(s). Reassign or remove products first.`
    );
  }

  const { error } = await supabaseAdmin
    .from('brands')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error('Failed to delete brand', { error, id });
    throw error;
  }

  logger.info('Brand deleted', { id, name: existing.name, by: req.user?.email });

  res.json({
    success: true,
    message: `Brand "${existing.name}" deleted successfully`,
  });
});

// =============================================================================
// HELPER: Enrich brands with product counts
// =============================================================================

async function enrichWithProductCounts(brands) {
  if (!brands || brands.length === 0) return [];

  const names = brands.map(b => b.name);

  // Get product counts per brand
  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('brand')
    .in('brand', names);

  if (error || !products) {
    return brands.map(b => ({ ...b, product_count: 0 }));
  }

  // Count products per brand
  const countMap = {};
  products.forEach(p => {
    if (p.brand) {
      countMap[p.brand] = (countMap[p.brand] || 0) + 1;
    }
  });

  return brands.map(b => ({
    ...b,
    product_count: countMap[b.name] || 0,
  }));
}

export default {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
};
