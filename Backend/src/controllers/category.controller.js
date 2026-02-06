/**
 * Category Controller
 * 
 * Full CRUD for product categories.
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

const logger = createLogger('CategoryController');

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
// LIST CATEGORIES
// GET /api/v1/categories
// =============================================================================

export const listCategories = catchAsync(async (req, res) => {
  const { search, page = 1, limit = 50, is_active } = req.query;

  const offset = (page - 1) * limit;

  // Build query
  let query = supabaseAdmin
    .from('categories')
    .select('*', { count: 'exact' })
    .order('sort_order', { ascending: true })
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
    logger.error('Failed to list categories', { error });
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
// GET SINGLE CATEGORY
// GET /api/v1/categories/:id
// =============================================================================

export const getCategory = catchAsync(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new NotFoundError('Category');
  }

  // Get product count
  const { count } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category', data.name);

  res.json({
    success: true,
    data: { ...data, product_count: count || 0 },
  });
});

// =============================================================================
// CREATE CATEGORY
// POST /api/v1/categories
// =============================================================================

export const createCategory = catchAsync(async (req, res) => {
  const { name, parent_id, image_url, is_active, sort_order } = req.body;

  const slug = generateSlug(name);

  // Check for duplicate name
  const { data: existing } = await supabaseAdmin
    .from('categories')
    .select('id')
    .ilike('name', name.trim())
    .single();

  if (existing) {
    throw new ConflictError(`Category "${name}" already exists`);
  }

  // Check for duplicate slug
  const { data: existingSlug } = await supabaseAdmin
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .single();

  if (existingSlug) {
    throw new ConflictError(`A category with slug "${slug}" already exists`);
  }

  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({
      name: name.trim(),
      slug,
      parent_id: parent_id || null,
      image_url: image_url || null,
      is_active: is_active ?? true,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create category', { error, name });
    if (error.code === '23505') {
      throw new ConflictError(`Category "${name}" already exists`);
    }
    throw error;
  }

  logger.info('Category created', { id: data.id, name: data.name, by: req.user?.email });

  res.status(201).json({
    success: true,
    data,
    message: 'Category created successfully',
  });
});

// =============================================================================
// UPDATE CATEGORY
// PATCH /api/v1/categories/:id
// =============================================================================

export const updateCategory = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Verify category exists
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    throw new NotFoundError('Category');
  }

  // If name is being changed, regenerate slug and check uniqueness
  if (updates.name && updates.name.trim() !== existing.name) {
    const slug = generateSlug(updates.name);
    updates.slug = slug;

    // Check for duplicate name (exclude current)
    const { data: duplicate } = await supabaseAdmin
      .from('categories')
      .select('id')
      .ilike('name', updates.name.trim())
      .neq('id', id)
      .single();

    if (duplicate) {
      throw new ConflictError(`Category "${updates.name}" already exists`);
    }
  }

  // Clean up the updates object
  const cleanUpdates = {};
  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.slug !== undefined) cleanUpdates.slug = updates.slug;
  if (updates.parent_id !== undefined) cleanUpdates.parent_id = updates.parent_id;
  if (updates.image_url !== undefined) cleanUpdates.image_url = updates.image_url;
  if (updates.is_active !== undefined) cleanUpdates.is_active = updates.is_active;
  if (updates.sort_order !== undefined) cleanUpdates.sort_order = updates.sort_order;

  if (Object.keys(cleanUpdates).length === 0) {
    throw new BadRequestError('No valid fields to update');
  }

  const { data, error } = await supabaseAdmin
    .from('categories')
    .update(cleanUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update category', { error, id });
    if (error.code === '23505') {
      throw new ConflictError(`Category name or slug already exists`);
    }
    throw error;
  }

  // If name was changed, update all products referencing the old name
  if (updates.name && updates.name.trim() !== existing.name) {
    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update({ category: updates.name.trim() })
      .eq('category', existing.name);

    if (updateError) {
      logger.warn('Failed to update product category references', { error: updateError });
    } else {
      logger.info('Updated product category references', {
        oldName: existing.name,
        newName: updates.name.trim(),
      });
    }
  }

  logger.info('Category updated', { id, changes: Object.keys(cleanUpdates), by: req.user?.email });

  res.json({
    success: true,
    data,
    message: 'Category updated successfully',
  });
});

// =============================================================================
// DELETE CATEGORY
// DELETE /api/v1/categories/:id
// =============================================================================

export const deleteCategory = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Verify category exists
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    throw new NotFoundError('Category');
  }

  // Check if any products use this category
  const { count: productCount } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category', existing.name);

  if (productCount && productCount > 0) {
    throw new ConflictError(
      `Cannot delete category "${existing.name}". It is used by ${productCount} product(s). Reassign or remove products first.`
    );
  }

  const { error } = await supabaseAdmin
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error('Failed to delete category', { error, id });
    throw error;
  }

  logger.info('Category deleted', { id, name: existing.name, by: req.user?.email });

  res.json({
    success: true,
    message: `Category "${existing.name}" deleted successfully`,
  });
});

// =============================================================================
// HELPER: Enrich categories with product counts
// =============================================================================

async function enrichWithProductCounts(categories) {
  if (!categories || categories.length === 0) return [];

  const names = categories.map(c => c.name);

  // Get product counts per category
  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('category')
    .in('category', names);

  if (error || !products) {
    return categories.map(c => ({ ...c, product_count: 0 }));
  }

  // Count products per category
  const countMap = {};
  products.forEach(p => {
    if (p.category) {
      countMap[p.category] = (countMap[p.category] || 0) + 1;
    }
  });

  return categories.map(c => ({
    ...c,
    product_count: countMap[c.name] || 0,
  }));
}

export default {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};
